'use client';

import type { Chat, Employee, Message } from '../types';
import { MessageItem } from './MessageItem';

type Props = {
  employee: Employee | null;
  chat: Chat | null;
  messages: Message[];
};

function avatarLabel(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function ConversationPane({ employee, chat, messages }: Props) {
  if (!employee) {
    return (
      <section className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,211,102,0.12),_transparent_40%),linear-gradient(180deg,#121a16,#0b110f)] text-ink-300">
        Select an employee to start viewing chats.
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,_rgba(37,211,102,0.10),_transparent_35%),linear-gradient(180deg,#0f1713,#0b110f)]">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25D366] to-emerald-950 text-sm font-semibold text-white">
            {avatarLabel(chat?.name ?? employee.display_name)}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{chat?.name ?? employee.display_name}</div>
            <div className="text-xs text-ink-400">{employee.session_status === 'connected' ? 'Live and synced' : employee.session_status}</div>
          </div>
        </div>
        {employee.session_status !== 'connected' ? (
          <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
            Reconnect Required
          </div>
        ) : null}
        <div className="text-xs uppercase tracking-[0.3em] text-ink-500">Read only</div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {chat ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {messages.map(message => (
              <MessageItem key={message.id} message={message} />
            ))}
            {!messages.length ? <div className="rounded-3xl border border-dashed border-white/10 p-6 text-sm text-ink-400">No messages loaded for this chat yet.</div> : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-ink-400">Select a chat to view the conversation.</div>
        )}
      </div>
    </section>
  );
}
