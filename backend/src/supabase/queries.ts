import { supabase } from './client.js';
import type { ChatRow, EmployeeRow, MessageRow } from '../types.js';

export async function insertEmployee(sessionKey: string, displayName = 'Connecting employee') {
  const { data, error } = await supabase
    .from('employees')
    .insert({
      session_key: sessionKey,
      display_name: displayName,
      status: 'connecting',
      session_status: 'pending_qr',
      presence: 'offline',
      session_data: {}
    })
    .select('*')
    .single<EmployeeRow>();

  if (error) throw error;
  return data;
}

export async function updateEmployeeBySessionKey(
  sessionKey: string,
  patch: Partial<EmployeeRow> & Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('employees')
    .update(patch)
    .eq('session_key', sessionKey)
    .select('*')
    .single<EmployeeRow>();

  if (error) throw error;
  return data;
}

export async function getEmployeeBySessionKey(sessionKey: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('session_key', sessionKey)
    .maybeSingle<EmployeeRow>();

  if (error) throw error;
  return data;
}

export async function listEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeRow[];
}

export async function markAllEmployeesDisconnected() {
  const employees = await listEmployees();
  const disconnectedAt = new Date().toISOString();
  const updatedEmployees: EmployeeRow[] = [];

  for (const employee of employees) {
    const { data, error } = await supabase
      .from('employees')
      .update({
        status: 'disconnected',
        session_status: 'disconnected',
        presence: 'offline',
        qr_payload: null,
        qr_generated_at: null,
        disconnected_at: disconnectedAt,
        last_error: null
      })
      .eq('session_key', employee.session_key)
      .select('*')
      .single<EmployeeRow>();

    if (error) throw error;
    updatedEmployees.push(data);
  }

  return updatedEmployees;
}

async function countTableRows(table: 'chats' | 'messages') {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countChats() {
  return countTableRows('chats');
}

export async function countMessages() {
  return countTableRows('messages');
}

export async function getEmployeeById(employeeId: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle<EmployeeRow>();

  if (error) throw error;
  return data;
}

export async function upsertChat(employeeId: string, chat: Partial<ChatRow> & { external_chat_id: string; name: string }) {
  const payload = {
    employee_id: employeeId,
    external_chat_id: chat.external_chat_id,
    chat_type: chat.chat_type ?? 'individual',
    name: chat.name,
    avatar_url: chat.avatar_url ?? null,
    last_message_preview: chat.last_message_preview ?? null,
    last_message_at: chat.last_message_at ?? null,
    unread_count: chat.unread_count ?? 0,
    is_archived: chat.is_archived ?? false,
    is_pinned: chat.is_pinned ?? false,
    raw_payload: chat.raw_payload ?? {}
  };

  const { data, error } = await supabase
    .from('chats')
    .upsert(payload, { onConflict: 'employee_id,external_chat_id' })
    .select('*')
    .single<ChatRow>();

  if (error) throw error;
  return data;
}

export async function getChatById(chatId: string) {
  const { data, error } = await supabase.from('chats').select('*').eq('id', chatId).maybeSingle<ChatRow>();
  if (error) throw error;
  return data;
}

export async function listChatsByEmployeeId(employeeId: string, search?: string) {
  const { data, error } = await supabase.from('chats').select('*').eq('employee_id', employeeId).order('last_message_at', {
    ascending: false,
    nullsFirst: false
  });
  if (error) throw error;
  const chats = (data ?? []) as ChatRow[];
  if (!search?.trim()) return chats;
  const needle = search.trim().toLowerCase();
  return chats.filter(chat => {
    const haystack = `${chat.name} ${chat.external_chat_id} ${chat.last_message_preview ?? ''} ${JSON.stringify(chat.raw_payload ?? {})}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export async function updateChatUnreadCount(chatId: string, unreadCount: number, preview?: string | null, lastMessageAt?: string | null) {
  const patch: Record<string, unknown> = { unread_count: unreadCount };
  if (preview !== undefined) patch.last_message_preview = preview;
  if (lastMessageAt !== undefined) patch.last_message_at = lastMessageAt;

  const { data, error } = await supabase
    .from('chats')
    .update(patch)
    .eq('id', chatId)
    .select('*')
    .single<ChatRow>();

  if (error) throw error;
  return data;
}

export async function upsertMessage(message: Partial<MessageRow> & {
  employee_id: string;
  chat_id: string;
  external_message_id: string;
  direction: MessageRow['direction'];
  kind: MessageRow['kind'];
  message_timestamp: string;
}) {
  const payload = {
    employee_id: message.employee_id,
    chat_id: message.chat_id,
    external_message_id: message.external_message_id,
    direction: message.direction,
    kind: message.kind,
    body: message.body ?? null,
    caption: message.caption ?? null,
    media_url: message.media_url ?? null,
    media_mime_type: message.media_mime_type ?? null,
    file_name: message.file_name ?? null,
    file_size: message.file_size ?? null,
    sender_id: message.sender_id ?? null,
    sender_name: message.sender_name ?? null,
    is_from_me: message.is_from_me ?? false,
    quoted_message_external_id: message.quoted_message_external_id ?? null,
    delivered_at: message.delivered_at ?? null,
    read_at: message.read_at ?? null,
    message_timestamp: message.message_timestamp,
    raw_payload: message.raw_payload ?? {}
  };

  const { data, error } = await supabase
    .from('messages')
    .upsert(payload, { onConflict: 'chat_id,external_message_id' })
    .select('*')
    .single<MessageRow>();

  if (error) throw error;
  return data;
}

export async function listMessagesByChatId(chatId: string, limit = 100, before?: string) {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('message_timestamp', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('message_timestamp', before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}
