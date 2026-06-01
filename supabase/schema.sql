create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type employee_status as enum ('connecting', 'connected', 'disconnected', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum ('idle', 'pending_qr', 'authenticated', 'connected', 'disconnected', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'chat_type') then
    create type chat_type as enum ('individual', 'group');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type message_direction as enum ('inbound', 'outbound');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_kind') then
    create type message_kind as enum (
      'text',
      'image',
      'video',
      'audio',
      'document',
      'sticker',
      'location',
      'contact',
      'ptt',
      'unknown'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  display_name text not null,
  wa_phone_number text,
  whatsapp_id text,
  avatar_url text,
  status employee_status not null default 'connecting',
  session_status session_status not null default 'pending_qr',
  presence text not null default 'offline',
  qr_payload text,
  qr_generated_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  session_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  external_chat_id text not null,
  chat_type chat_type not null default 'individual',
  name text not null,
  avatar_url text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  is_archived boolean not null default false,
  is_pinned boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chats_employee_external_unique unique (employee_id, external_chat_id),
  constraint chats_unread_count_nonnegative check (unread_count >= 0)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  external_message_id text not null,
  direction message_direction not null,
  kind message_kind not null default 'text',
  body text,
  caption text,
  media_url text,
  media_mime_type text,
  file_name text,
  file_size bigint,
  sender_id text,
  sender_name text,
  is_from_me boolean not null default false,
  quoted_message_external_id text,
  delivered_at timestamptz,
  read_at timestamptz,
  message_timestamp timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_chat_external_unique unique (chat_id, external_message_id)
);

create index if not exists employees_status_idx
  on public.employees (status, session_status);

create index if not exists employees_session_key_idx
  on public.employees (session_key);

create index if not exists chats_employee_id_last_message_idx
  on public.chats (employee_id, last_message_at desc nulls last);

create index if not exists chats_employee_unread_idx
  on public.chats (employee_id, unread_count desc, last_message_at desc nulls last);

create index if not exists messages_chat_timestamp_idx
  on public.messages (chat_id, message_timestamp desc);

create index if not exists messages_employee_timestamp_idx
  on public.messages (employee_id, message_timestamp desc);

create index if not exists messages_employee_external_idx
  on public.messages (employee_id, external_message_id);

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists trg_chats_updated_at on public.chats;
create trigger trg_chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();