import { getChatById, listChatsByEmployeeId, updateChatUnreadCount, upsertChat } from '../supabase/queries.js';

export async function saveChat(employeeId: string, chat: Parameters<typeof upsertChat>[1]) {
  return upsertChat(employeeId, chat);
}

export async function getChatsForEmployee(employeeId: string, search?: string) {
  return listChatsByEmployeeId(employeeId, search);
}

export async function getChat(chatId: string) {
  return getChatById(chatId);
}

export async function setChatUnreadCount(chatId: string, unreadCount: number, preview?: string | null, lastMessageAt?: string | null) {
  return updateChatUnreadCount(chatId, unreadCount, preview, lastMessageAt);
}
