import { listMessagesByChatId, upsertMessage } from '../supabase/queries.js';

export async function saveMessage(message: Parameters<typeof upsertMessage>[0]) {
  return upsertMessage(message);
}

export async function getMessagesForChat(chatId: string, limit = 100, before?: string) {
  return listMessagesByChatId(chatId, limit, before);
}
