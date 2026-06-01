import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Client, Chat, Message as WAMessage } from 'whatsapp-web.js';
import { socketEvents } from '../socket/events.js';
import { getSocketServer } from '../socket/index.js';
import { createEmployeeSession, getEmployeeSession, updateEmployeeSession } from '../services/employee.service.js';
import { saveChat } from '../services/chat.service.js';
import { saveMessage } from '../services/message.service.js';
import { syncHistory } from '../services/sync.service.js';
import { normalizeMessageKind } from '../utils/normalize.js';
import { logger } from '../utils/logger.js';
import { toErrorMessage } from '../utils/errors.js';
import { getWhatsAppAuthPath } from '../utils/env.js';
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
  reconnectTimer?: NodeJS.Timeout;
};

const clients = new Map<string, ManagedClient>();

function getLocalAuthSessionDir(sessionKey: string) {
  return path.resolve(getWhatsAppAuthPath(), `session-${sessionKey}`);
}

async function removeLocalAuthSession(sessionKey: string) {
  const sessionDir = getLocalAuthSessionDir(sessionKey);
  await rm(sessionDir, { recursive: true, force: true, maxRetries: 4 });
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

  getSocketServer().emit(socketEvents.qrGenerated, {
    sessionKey,
    employeeId: employee?.id ?? null,
    qr,
    qrDataUrl,
    generatedAt: new Date().toISOString()
  });
}

async function handleReady(sessionKey: string, client: Client) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;

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

  getSocketServer().emit(socketEvents.employeeConnected, {
    employee: await getEmployeeSession(sessionKey)
  });

  await syncHistory(sessionKey, client);
}

async function handleMessage(sessionKey: string, message: WAMessage) {
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

  await updateEmployeeSession(sessionKey, {
    last_seen_at: new Date().toISOString(),
    status: 'connected',
    session_status: 'connected'
  });

  const io = getSocketServer();
  io.emit(socketEvents.chatUpdated, {
    employeeId: employee.id,
    chat: savedChat
  });
  io.emit(socketEvents.messageReceived, {
    employeeId: employee.id,
    chatId: savedChat.id,
    message: savedMessage
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

  getSocketServer().emit(socketEvents.employeeDisconnected, {
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
  const client = createWhatsappClient(sessionKey);

  clients.set(sessionKey, { client, manualDisconnect: false });

  client.on('qr', qr => {
    emitQr(sessionKey, qr).catch(error => logger.error('qr event failed', toErrorMessage(error)));
  });

  client.on('authenticated', async () => {
    await updateEmployeeSession(sessionKey, {
      status: 'connecting',
      session_status: 'authenticated',
      last_error: null
    });
  });

  client.on('ready', () => {
    handleReady(sessionKey, client).catch(error => logger.error('ready handler failed', toErrorMessage(error)));
  });

  client.on('message', message => {
    handleMessage(sessionKey, message).catch(error => logger.error('message handler failed', toErrorMessage(error)));
  });

  client.on('disconnected', reason => {
    handleDisconnected(sessionKey, reason).catch(error => logger.error('disconnect handler failed', toErrorMessage(error)));
  });

  client.on('auth_failure', reason => {
    updateEmployeeSession(sessionKey, {
      status: 'error',
      session_status: 'error',
      last_error: reason
    }).catch(error => logger.error('auth failure update failed', toErrorMessage(error)));
  });

  setImmediate(() => {
    void client.initialize().catch(error => {
      const message = toErrorMessage(error);
      logger.error(`initialize failed for ${sessionKey}`, message);
      updateEmployeeSession(sessionKey, {
        status: 'error',
        session_status: 'error',
        last_error: message
      }).catch(updateError => logger.error('failed to persist initialize error', toErrorMessage(updateError)));
    });
  });

  return { employee, sessionKey };
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

  try {
    await managed.client.logout();
  } catch (error) {
    logger.warn(`logout failed for ${sessionKey}`, toErrorMessage(error));
  }

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
    getSocketServer().emit(socketEvents.employeeDisconnected, {
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
  if (managed) {
    managed.manualDisconnect = true;
    if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);

    try {
      await managed.client.logout();
    } catch (error) {
      logger.warn(`logout failed for ${sessionKey}`, toErrorMessage(error));
    }

    try {
      await managed.client.destroy();
    } catch (error) {
      logger.warn(`destroy failed for ${sessionKey}`, toErrorMessage(error));
    }

    clients.delete(sessionKey);
  }

  try {
    await removeLocalAuthSession(sessionKey);
  } catch (error) {
    logger.warn(`LocalAuth cleanup failed for ${sessionKey}`, toErrorMessage(error));
  }

  return true;
}

export function listManagedSessions() {
  return Array.from(clients.keys());
}
