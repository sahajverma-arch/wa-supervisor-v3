export type EmployeeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type SessionStatus = 'idle' | 'pending_qr' | 'authenticated' | 'connected' | 'disconnected' | 'error';
export type ChatType = 'individual' | 'group';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'ptt'
  | 'unknown';

export interface EmployeeRow {
  id: string;
  session_key: string;
  display_name: string;
  wa_phone_number: string | null;
  whatsapp_id: string | null;
  avatar_url: string | null;
  status: EmployeeStatus;
  session_status: SessionStatus;
  presence: string;
  qr_payload: string | null;
  qr_generated_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_seen_at: string | null;
  last_error: string | null;
  session_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatRow {
  id: string;
  employee_id: string;
  external_chat_id: string;
  chat_type: ChatType;
  name: string;
  avatar_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  is_pinned: boolean;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  employee_id: string;
  chat_id: string;
  external_message_id: string;
  direction: MessageDirection;
  kind: MessageKind;
  body: string | null;
  caption: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  sender_id: string | null;
  sender_name: string | null;
  is_from_me: boolean;
  quoted_message_external_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  message_timestamp: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConnectEmployeeResponse {
  employee: EmployeeRow;
  sessionKey: string;
}
