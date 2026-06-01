'use client';

import type { Chat } from '../types';

type Props = {
  chats: Chat[];
  selectedChatId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (chat: Chat) => void;
};

function formatTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function ChatList({ chats, selectedChatId, search, onSearchChange, onSelect }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col border-r border-white/10 bg-[#101815]/90">
      <div className="border-b border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-sm text-white placeholder:text-ink-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats.map(chat => {
          const selected = chat.id === selectedChatId;
          return (
            <button
              key={chat.id}
              onClick={() => onSelect(chat)}
              className={[
                'flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition',
                selected ? 'bg-white/7' : 'hover:bg-white/4'
              ].join(' ')}
            >
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-ink-700 to-ink-900 text-xs font-semibold text-white">
                {chat.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-white">{chat.name}</div>
                  <span className="shrink-0 text-[11px] text-ink-500">{formatTime(chat.last_message_at)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="truncate text-sm text-ink-400">{chat.last_message_preview ?? 'No messages yet'}</div>
                  {chat.unread_count > 0 ? (
                    <span className="rounded-full bg-[#25D366] px-2 py-0.5 text-[11px] font-semibold text-[#06250f]">
                      {chat.unread_count}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}

        {!chats.length ? <div className="p-6 text-sm text-ink-400">Select an employee to load chats.</div> : null}
      </div>
    </section>
  );
}
