import type { Client, Chat, Message as WAMessage } from 'whatsapp-web.js';
import { emitRealtimeEvent } from '../socket/broadcast.js';
import { getEmployeeSession, updateEmployeeSession } from './employee.service.js';
import { saveChat } from './chat.service.js';
import { saveMessage } from './message.service.js';
import { normalizeMessageKind } from '../utils/normalize.js';
import { logger } from '../utils/logger.js';
import { toErrorMessage } from '../utils/errors.js';

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

function toIso(value: number | Date | undefined) {
  if (!value) return new Date().toISOString();
  const date = typeof value === 'number' ? new Date(value * 1000) : value;
  return date.toISOString();
}

function getMessageBody(message: WAMessage) {
  const msg = message as WhatsAppMessageLike;
  if (msg.body) return msg.body;
  if (msg.caption) return msg.caption;
  return null;
}

async function buildMediaUrl(message: WAMessage) {
  if (!message.hasMedia) return null;
  try {
    const media = await (message as WhatsAppMessageLike).downloadMedia();
    if (!media) return null;
    return `data:${media.mimetype};base64,${media.data}`;
  } catch {
    return null;
  }
}

async function normalizeChat(clientChat: Chat, employeeId: string, lastPreview: string | null, lastAt: string | null) {
  const chat = clientChat as WhatsAppChatLike;
  return saveChat(employeeId, {
    external_chat_id: clientChat.id._serialized,
    chat_type: clientChat.isGroup ? 'group' : 'individual',
    name: chat.name || chat.formattedTitle || chat.id.user || 'Unknown chat',
    avatar_url: null,
    last_message_preview: lastPreview,
    last_message_at: lastAt,
    unread_count: chat.unreadCount ?? 0,
    is_archived: chat.archived ?? false,
    is_pinned: chat.pinned ?? false,
    raw_payload: {
      id: clientChat.id._serialized,
      name: chat.name,
      formattedTitle: chat.formattedTitle ?? null,
      isGroup: clientChat.isGroup,
      isReadOnly: chat.isReadOnly ?? false,
      isMuted: chat.isMuted ?? false,
      muteExpiration: chat.muteExpiration ?? null,
      archived: chat.archived ?? false,
      pinned: chat.pinned ?? false,
      isLocked: chat.isLocked ?? false,
      timestamp: chat.timestamp ?? null,
      unreadCount: chat.unreadCount ?? 0,
      lastMessage: chat.lastMessage
        ? {
            id: chat.lastMessage.id?._serialized ?? null,
            type: chat.lastMessage.type ?? null,
            body: chat.lastMessage.body ?? null,
            timestamp: chat.lastMessage.timestamp ?? null,
            fromMe: chat.lastMessage.fromMe ?? false
          }
        : null
    }
  });
}

export async function syncHistory(sessionKey: string, client: Client) {
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) return;

  const chats = await client.getChats();
  const totalChatsReturnedByWhatsApp = chats.length;
  const orderedChats = [...chats].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 200);

  let syncedMessages = 0;
  let syncedChats = 0;

  logger.info('TOTAL_CHATS_FROM_WHATSAPP', {
    sessionKey,
    TOTAL_CHATS_FROM_WHATSAPP: totalChatsReturnedByWhatsApp
  });

  for (const chat of orderedChats) {
    const chatLike = chat as WhatsAppChatLike;
    const lastMessage = chatLike.lastMessage ?? null;
    const lastPreview = lastMessage ? getMessageBody(lastMessage) ?? lastMessage.body ?? null : null;
    const lastAt = lastMessage ? toIso(lastMessage.timestamp) : chat.timestamp ? toIso(chat.timestamp) : null;

    const savedChat = await normalizeChat(chat, employee.id, lastPreview, lastAt);
    syncedChats += 1;

    emitRealtimeEvent('chatUpdated', {
      employeeId: employee.id,
      chat: savedChat
    });

    try {
      const messages = await chat.fetchMessages({ limit: 100 });
      const sortedMessages = [...messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

      for (const message of sortedMessages) {
        const msg = message as WhatsAppMessageLike;
        const savedMessage = await saveMessage({
          employee_id: employee.id,
          chat_id: savedChat.id,
          external_message_id: message.id._serialized,
          direction: message.fromMe ? 'outbound' : 'inbound',
          kind: normalizeMessageKind(message.type),
          body: getMessageBody(message),
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
          message_timestamp: toIso(message.timestamp),
          raw_payload: {
            id: message.id._serialized,
            type: message.type,
            from: message.from,
            to: message.to,
            fromMe: message.fromMe,
            hasMedia: message.hasMedia
          }
        });
        syncedMessages += 1;
        emitRealtimeEvent('messageReceived', {
          employeeId: employee.id,
          chatId: savedChat.id,
          message: savedMessage
        });
      }
    } catch (error) {
      logger.warn(`Message history fetch failed for chat ${chat.id._serialized}`, {
        sessionKey,
        chatId: chat.id._serialized,
        error: toErrorMessage(error)
      });
    }
  }

  await updateEmployeeSession(sessionKey, {
    status: 'connected',
    session_status: 'connected',
    connected_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    session_data: {
      ...(employee.session_data ?? {}),
      historySyncedAt: new Date().toISOString(),
      syncedChats,
      syncedMessages
    }
  });

  emitRealtimeEvent('historySynced', {
    employeeId: employee.id,
    sessionKey,
    chatCount: syncedChats,
    messageCount: syncedMessages,
    syncedAt: new Date().toISOString()
  });
  logger.info('TOTAL_CHATS_STORED', {
    sessionKey,
    TOTAL_CHATS_STORED: syncedChats
  });
  logger.info('TOTAL_MESSAGES_STORED', {
    sessionKey,
    TOTAL_MESSAGES_STORED: syncedMessages
  });
}
