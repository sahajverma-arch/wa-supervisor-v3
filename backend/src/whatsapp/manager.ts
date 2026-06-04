import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Client, Chat, Message as WAMessage } from 'whatsapp-web.js';
import { emitRealtimeEvent } from '../socket/broadcast.js';
import { createEmployeeSession, getEmployeeSession, updateEmployeeSession } from '../services/employee.service.js';
import { saveChat } from '../services/chat.service.js';
import { saveMessage } from '../services/message.service.js';
import { setChatUnreadCount } from '../services/chat.service.js';
import { syncHistory } from '../services/sync.service.js';
import { normalizeMessageKind } from '../utils/normalize.js';
import { logger } from '../utils/logger.js';
import { serializeError, toErrorMessage } from '../utils/errors.js';
import { resolveWhatsAppAuthPath } from '../utils/env.js';
import { createWhatsappClient } from './clientFactory.js';

type WhatsAppMessageLike = WAMessage & {
  caption?: string | null;
  filename?: string | null;
  notifyName?: string | null;
  quotedMsgId?: { _serialized?: string } | null;
  _data?: { mimetype?: string };
};

type WhatsAppChatLike = Chat & {
  formattedTitle?: string;
  lastMessage?: WAMessage | null;
};

type ManagedClient = {
  client: Client;
  manualDisconnect: boolean;
  sawQr: boolean;
  ready: boolean;
  reconnectTimer?: NodeJS.Timeout;
};

const clients = new Map<string, ManagedClient>();

function getLocalAuthSessionDir(sessionKey: string, authPath: string) {
  return path.resolve(authPath, `session-${sessionKey}`);
}

async function removeLocalAuthSession(sessionKey: string, authPath: string) {
  const sessionDir = getLocalAuthSessionDir(sessionKey, authPath);
  await rm(sessionDir, { recursive: true, force: true, maxRetries: 4 });
}

async function hasLocalAuthSession(sessionKey: string, authPath: string) {
  try {
    await access(getLocalAuthSessionDir(sessionKey, authPath));
    return true;
  } catch {
    return false;
  }
}

function getBody(message: WAMessage) {
  const msg = message as WhatsAppMessageLike;
  if (msg.body) return msg.body;
  if (msg.caption) return msg.caption;
  return null;
}

async function buildMediaUrl(message: WAMessage) {
  if (!message.hasMedia) return null;
  try {
    const media = await (message as WhatsAppMessageLike).downloadMedia();
    return media ? `data:${media.mimetype};base64,${media.data}` : null;
  } catch {
    return null;
  }
}

async function cleanupFailedClient(sessionKey: string, client: Client) {
  const managed = clients.get(sessionKey);
  if (managed) {
    managed.manualDisconnect = true;
    if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
  }

  try {
    await client.destroy();
  } catch (error) {
    logger.warn(`destroy failed for ${sessionKey}`, toErrorMessage(error));
  }

  clients.delete(sessionKey);
}

async function logoutIfReady(sessionKey: string, managed: ManagedClient) {
  if (!managed.ready) {
    logger.info('SKIPPING_LOGOUT_BEFORE_READY', {
      sessionKey,
      reason: 'client_not_ready'
    });
    return;
  }

  try {
    await managed.client.logout();
  } catch (error) {
    logger.warn(`logout failed for ${sessionKey}`, toErrorMessage(error));
  }
}

function logLifecycleEvent(eventName: string, sessionKey: string, payload: unknown) {
  logger.info(`WHATSAPP_${eventName.toUpperCase()}`, {
    sessionKey,
    payload
  });
}

function logLifecycleError(eventName: string, sessionKey: string, error: unknown) {
  logger.error(`WHATSAPP_${eventName.toUpperCase()}_ERROR`, {
    sessionKey,
    error: serializeError(error)
  });
}

function registerClientListeners(sessionKey: string, client: Client) {
  client.on('qr', async qr => {
    logLifecycleEvent('qr', sessionKey, { qr });
    try {
      const managed = clients.get(sessionKey);
      if (managed) managed.sawQr = true;
      await emitQr(sessionKey, qr);
    } catch (error) {
      logLifecycleError('qr', sessionKey, error);
    }
  });

  client.on('authenticated', async (payload: unknown) => {
    logLifecycleEvent('authenticated', sessionKey, { payload });
    try {
      await updateEmployeeSession(sessionKey, {
        status: 'connecting',
        session_status: 'authenticated',
        last_error: null
      });
      logger.info('SESSION_AUTHENTICATED', {
        sessionKey,
        payload
      });
    } catch (error) {
      logLifecycleError('authenticated', sessionKey, error);
    }
  });

  client.on('loading_screen', async (percent: number, message: string) => {
    logLifecycleEvent('loading_screen', sessionKey, { percent, message });
    try {
      await updateEmployeeSession(sessionKey, {
        status: 'connecting',
        last_error: null
      });
    } catch (error) {
      logLifecycleError('loading_screen', sessionKey, error);
    }
  });

  client.on('ready', async (payload: unknown) => {
    logLifecycleEvent('ready', sessionKey, { payload });
    try {
      const managed = clients.get(sessionKey);
      if (managed) managed.ready = true;
      await handleReady(sessionKey, client);
    } catch (error) {
      logLifecycleError('ready', sessionKey, error);
    }
  });

  client.on('change_state', async (state: string) => {
    logLifecycleEvent('change_state', sessionKey, { state });
    try {
      const employee = await getEmployeeSession(sessionKey);
      if (!employee) return;
      await updateEmployeeSession(sessionKey, {
        last_seen_at: new Date().toISOString(),
        status: state === 'CONFLICT' ? 'error' : 'connecting',
        last_error: null
      });
    } catch (error) {
      logLifecycleError('change_state', sessionKey, error);
    }
  });

  client.on('auth_failure', async payload => {
    logLifecycleEvent('auth_failure', sessionKey, { payload });
    try {
      if (/qr|qrcode|expired/i.test(payload)) {
        logger.info('QR_EXPIRED', {
          sessionKey,
          reason: payload
        });
      }
      await updateEmployeeSession(sessionKey, {
        status: 'error',
        session_status: 'error',
        last_error: payload
      });
    } catch (error) {
      logLifecycleError('auth_failure', sessionKey, error);
    }
  });

  client.on('disconnected', async reason => {
    logLifecycleEvent('disconnected', sessionKey, { reason });
    try {
      await handleDisconnected(sessionKey, reason);
    } catch (error) {
      logLifecycleError('disconnected', sessionKey, error);
    }
  });

  client.on('message_create', async message => {
    logLifecycleEvent('message_create', sessionKey, {
      messageId: message.id?._serialized ?? null,
      fromMe: message.fromMe,
      type: message.type
    });
    try {
      await handleMessageCreate(sessionKey, message);
    } catch (error) {
      logLifecycleError('message_create', sessionKey, error);
    }
  });

  client.on('message_ack', async (message, ack) => {
    logLifecycleEvent('message_ack', sessionKey, {
      messageId: message.id?._serialized ?? null,
      fromMe: message.fromMe,
      type: message.type,
      ack
    });
    try {
      await handleMessageAck(sessionKey, message, ack);
    } catch (error) {
      logLifecycleError('message_ack', sessionKey, error);
    }
  });
}

function startManagedClient(sessionKey: string, client: Client) {
  clients.set(sessionKey, { client, manualDisconnect: false, sawQr: false, ready: false });
  registerClientListeners(sessionKey, client);

  setImmediate(() => {
    void client.initialize().catch(async error => {
      const message = toErrorMessage(error);
      logger.error(`initialize failed for ${sessionKey}`, serializeError(error));
      await cleanupFailedClient(sessionKey, client);
      updateEmployeeSession(sessionKey, {
        status: 'error',
        session_status: 'error',
        last_error: message
      }).catch(updateError => logger.error('failed to persist initialize error', toErrorMessage(updateError)));
    });
  });
}

async function emitQr(sessionKey: string, qr: string) {
  const employee = await getEmployeeSession(sessionKey);
  const qrDataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 1, scale: 8 });
  await updateEmployeeSession(sessionKey, {
    qr_payload: qr,
    qr_generated_at: new Date().toISOString(),
    session_status: 'pending_qr',
    status: 'connecting',
    last_error: null
  });

  logger.info('QR_GENERATED', {
    sessionKey,
    employeeId: employee?.id ?? null
  });

  logger.info('QR_STORED', {
    sessionKey,
    employeeId: employee?.id ?? null
  });

  emitRealtimeEvent('qrGenerated', {
    sessionKey,
    employeeId: employee?.id ?? null,
    qr,
    qrDataUrl,
    generatedAt: new Date().toISOString()
  });

  logger.info('QR_EMITTED', {
    sessionKey,
    employeeId: employee?.id ?? null
  });
}

async function handleReady(sessionKey: string, client: Client) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;
  const managed = clients.get(sessionKey);
  if (managed && !managed.sawQr) {
    logger.info('QR_EXPIRED', {
      sessionKey,
      employeeId: employee.id,
      reason: 'session_restored_without_qr'
    });
  }

  const wid = client.info?.wid?._serialized ?? null;
  const phone = client.info?.wid?.user ?? null;
  const displayName = client.info?.pushname || employee.display_name || 'Connected employee';

  await updateEmployeeSession(sessionKey, {
    display_name: displayName,
    wa_phone_number: phone,
    whatsapp_id: wid,
    avatar_url: employee.avatar_url,
    status: 'connected',
    session_status: 'connected',
    presence: 'online',
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    last_seen_at: new Date().toISOString(),
    qr_payload: null,
    last_error: null
  });

  logger.info('PRESENCE_UPDATED', {
    sessionKey,
    employeeId: employee.id,
    presence: 'online'
  });

  emitRealtimeEvent('employeeConnected', {
    employee: await getEmployeeSession(sessionKey)
  });

  await syncHistory(sessionKey, client);
}

async function handleMessageCreate(sessionKey: string, message: WAMessage) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;
  const chat = await message.getChat();
  const chatLike = chat as WhatsAppChatLike;
  const msg = message as WhatsAppMessageLike;
  const savedChat = await saveChat(employee.id, {
    external_chat_id: chat.id._serialized,
    chat_type: chat.isGroup ? 'group' : 'individual',
    name: chatLike.name || chatLike.formattedTitle || chatLike.id.user || 'Unknown chat',
    avatar_url: null,
    last_message_preview: getBody(message),
    last_message_at: new Date(message.timestamp * 1000).toISOString(),
    unread_count: chatLike.unreadCount ?? 0,
    is_archived: false,
    is_pinned: false,
    raw_payload: {
      id: chat.id._serialized,
      isGroup: chat.isGroup
    }
  });

  const savedMessage = await saveMessage({
    employee_id: employee.id,
    chat_id: savedChat.id,
    external_message_id: message.id._serialized,
    direction: message.fromMe ? 'outbound' : 'inbound',
    kind: normalizeMessageKind(message.type),
    body: getBody(message),
    caption: msg.caption ?? null,
    media_url: await buildMediaUrl(message),
    media_mime_type: message.hasMedia ? (msg._data?.mimetype ?? null) : null,
    file_name: msg.filename ?? null,
    file_size: null,
    sender_id: message.author ?? message.from ?? null,
    sender_name: msg.notifyName ?? null,
    is_from_me: message.fromMe,
    quoted_message_external_id: message.hasQuotedMsg ? (msg.quotedMsgId?._serialized ?? null) : null,
    delivered_at: null,
    read_at: null,
    message_timestamp: new Date(message.timestamp * 1000).toISOString(),
    raw_payload: {
      id: message.id._serialized,
      type: message.type,
      fromMe: message.fromMe,
      hasMedia: message.hasMedia
    }
  });

  await setChatUnreadCount(savedChat.id, chatLike.unreadCount ?? 0, getBody(message), new Date(message.timestamp * 1000).toISOString());

  await updateEmployeeSession(sessionKey, {
    last_seen_at: new Date().toISOString(),
    status: 'connected',
    session_status: 'connected'
  });

  logger.info('MESSAGE_RECEIVED', {
    sessionKey,
    employeeId: employee.id,
    chatId: savedChat.id,
    messageId: message.id._serialized,
    direction: message.fromMe ? 'outbound' : 'inbound'
  });

  logger.info('MESSAGE_STORED', {
    sessionKey,
    employeeId: employee.id,
    chatId: savedChat.id,
    messageId: message.id._serialized
  });

  emitRealtimeEvent('chatUpdated', {
    employeeId: employee.id,
    chat: savedChat
  });

  emitRealtimeEvent('messageReceived', {
    employeeId: employee.id,
    chatId: savedChat.id,
    message: savedMessage
  });

  logger.info('MESSAGE_EMITTED', {
    sessionKey,
    employeeId: employee.id,
    chatId: savedChat.id,
    messageId: message.id._serialized
  });
}

async function handleMessageAck(sessionKey: string, message: WAMessage, ack: number) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;

  const messageTimestamp = new Date(message.timestamp * 1000).toISOString();
  const deliveredAt = ack >= 2 ? messageTimestamp : null;
  const readAt = ack >= 3 ? messageTimestamp : null;

  const savedMessage = await saveMessage({
    employee_id: employee.id,
    chat_id: (await message.getChat()).id._serialized,
    external_message_id: message.id._serialized,
    direction: message.fromMe ? 'outbound' : 'inbound',
    kind: normalizeMessageKind(message.type),
    body: getBody(message),
    caption: (message as WhatsAppMessageLike).caption ?? null,
    media_url: await buildMediaUrl(message),
    media_mime_type: message.hasMedia ? ((message as WhatsAppMessageLike)._data?.mimetype ?? null) : null,
    file_name: (message as WhatsAppMessageLike).filename ?? null,
    file_size: null,
    sender_id: message.author ?? message.from ?? null,
    sender_name: (message as WhatsAppMessageLike).notifyName ?? null,
    is_from_me: message.fromMe,
    quoted_message_external_id: message.hasQuotedMsg ? ((message as WhatsAppMessageLike).quotedMsgId?._serialized ?? null) : null,
    delivered_at: deliveredAt,
    read_at: readAt,
    message_timestamp: messageTimestamp,
    raw_payload: {
      id: message.id._serialized,
      type: message.type,
      fromMe: message.fromMe,
      hasMedia: message.hasMedia,
      ack
    }
  });

  emitRealtimeEvent('messageReceived', {
    employeeId: employee.id,
    chatId: savedMessage.chat_id,
    message: savedMessage
  });

  emitRealtimeEvent('messageAck', {
    employeeId: employee.id,
    chatId: savedMessage.chat_id,
    ack,
    message: savedMessage
  });

  logger.info('MESSAGE_ACK', {
    sessionKey,
    employeeId: employee.id,
    messageId: message.id._serialized,
    ack
  });
}

async function handleDisconnected(sessionKey: string, reason: string) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;

  await updateEmployeeSession(sessionKey, {
    status: 'disconnected',
    session_status: 'disconnected',
    presence: 'offline',
    disconnected_at: new Date().toISOString(),
    last_error: reason
  });

  logger.info('PRESENCE_UPDATED', {
    sessionKey,
    employeeId: employee.id,
    presence: 'offline'
  });

  if (/qr|qrcode|expired/i.test(reason)) {
    logger.info('QR_EXPIRED', {
      sessionKey,
      employeeId: employee.id,
      reason
    });
  }

  emitRealtimeEvent('employeeDisconnected', {
    employeeId: employee.id,
    sessionKey,
    reason,
    disconnectedAt: new Date().toISOString()
  });

  const managed = clients.get(sessionKey);
  if (!managed) return;
  if (managed.manualDisconnect) return;

  if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
  managed.reconnectTimer = setTimeout(() => {
    logger.info(`Reinitializing WhatsApp client for ${sessionKey}`);
    managed.client.initialize().catch(error => logger.error(`Reconnect failed for ${sessionKey}`, toErrorMessage(error)));
  }, 5000);
}

export async function connectEmployee() {
  const sessionKey = `session_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const employee = await createEmployeeSession(sessionKey);
  const authPath = await resolveWhatsAppAuthPath();

  try {
    const client = await createWhatsappClient(sessionKey);

    logger.info('SESSION_INITIALIZED', {
      sessionKey,
      authPath,
      authSessionExists: await hasLocalAuthSession(sessionKey, authPath)
    });
    startManagedClient(sessionKey, client);

    return { employee, sessionKey };
  } catch (error) {
    logger.error(`WhatsApp client setup failed for ${sessionKey}`, serializeError(error));
    await updateEmployeeSession(sessionKey, {
      status: 'error',
      session_status: 'error',
      last_error: toErrorMessage(error)
    }).catch(updateError => logger.error('failed to persist connect error', serializeError(updateError)));
    throw error;
  }
}

export async function resyncEmployee(sessionKey: string) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return false;

  const managed = clients.get(sessionKey);
  if (managed) {
    await syncHistory(sessionKey, managed.client);
    return true;
  }

  const authPath = await resolveWhatsAppAuthPath();
  try {
    const client = await createWhatsappClient(sessionKey);
    logger.info('SESSION_INITIALIZED', {
      sessionKey,
      authPath,
      authSessionExists: await hasLocalAuthSession(sessionKey, authPath)
    });
    startManagedClient(sessionKey, client);
    return true;
  } catch (error) {
    logger.error(`WhatsApp client resync failed for ${sessionKey}`, serializeError(error));
    await updateEmployeeSession(sessionKey, {
      status: 'error',
      session_status: 'error',
      last_error: toErrorMessage(error)
    }).catch(updateError => logger.error('failed to persist resync error', serializeError(updateError)));
    throw error;
  }
}

export async function disconnectEmployee(sessionKey: string) {
  const managed = clients.get(sessionKey);
  if (!managed) {
    const employee = await getEmployeeSession(sessionKey);
    if (!employee) return false;
    await updateEmployeeSession(sessionKey, {
      status: 'disconnected',
      session_status: 'disconnected',
      presence: 'offline',
      disconnected_at: new Date().toISOString()
    });
    return true;
  }

  managed.manualDisconnect = true;
  if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);

  await logoutIfReady(sessionKey, managed);

  try {
    await managed.client.destroy();
  } catch (error) {
    logger.warn(`destroy failed for ${sessionKey}`, toErrorMessage(error));
  }

  clients.delete(sessionKey);
  const employee = await getEmployeeSession(sessionKey);
  if (employee) {
    await updateEmployeeSession(sessionKey, {
      status: 'disconnected',
      session_status: 'disconnected',
      presence: 'offline',
      disconnected_at: new Date().toISOString()
    });
    emitRealtimeEvent('employeeDisconnected', {
      employeeId: employee.id,
      sessionKey,
      reason: 'manual_disconnect',
      disconnectedAt: new Date().toISOString()
    });
  }
  return true;
}

export async function deleteEmployeeSession(sessionKey: string) {
  const managed = clients.get(sessionKey);
  const authPath = await resolveWhatsAppAuthPath();
  if (managed) {
    managed.manualDisconnect = true;
    if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);

    await logoutIfReady(sessionKey, managed);

    try {
      await managed.client.destroy();
    } catch (error) {
      logger.warn(`destroy failed for ${sessionKey}`, toErrorMessage(error));
    }

    clients.delete(sessionKey);
  }

  try {
    await removeLocalAuthSession(sessionKey, authPath);
  } catch (error) {
    logger.warn(`LocalAuth cleanup failed for ${sessionKey}`, toErrorMessage(error));
  }

  return true;
}

export function listManagedSessions() {
  return Array.from(clients.keys());
}
