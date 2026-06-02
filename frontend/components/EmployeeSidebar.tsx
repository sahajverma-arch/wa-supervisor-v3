'use client';

import type { KeyboardEvent } from 'react';
import type { Employee } from '../types';

type Props = {
  employees: Employee[];
  selectedSessionKey: string | null;
  onSelect: (employee: Employee) => void;
  onConnect: () => void;
  onResync: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
};

function statusTone(status: Employee['status']) {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500';
    case 'connecting':
      return 'bg-amber-400';
    case 'error':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}

function handleEnterSpace(event: KeyboardEvent<HTMLDivElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function EmployeeSidebar({ employees, selectedSessionKey, onSelect, onConnect, onResync, onDelete }: Props) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-white/10 bg-[#0f1713]/95 p-3">
      <button
        onClick={onConnect}
        className="mb-3 rounded-2xl bg-[#25D366] px-4 py-3 text-left text-sm font-semibold text-[#06250f] shadow-lg shadow-emerald-950/20 transition hover:brightness-105"
      >
        Connect WhatsApp
      </button>

      <div className="mb-2 px-2 text-xs uppercase tracking-[0.3em] text-ink-400">Employees</div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {employees.map(employee => {
          const selected = employee.session_key === selectedSessionKey;
          return (
            <div
              key={employee.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(employee)}
              onKeyDown={event => handleEnterSpace(event, () => onSelect(employee))}
              className={[
                'group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition outline-none',
                selected ? 'border-[#25D366]/60 bg-white/7' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
              ].join(' ')}
            >
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onResync(employee);
                }}
                className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-200 transition hover:bg-white/10 hover:text-white"
                title="Refetch recent chats and messages"
              >
                Resync
              </button>

              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onDelete(employee);
                }}
                className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/30 p-1.5 text-ink-200 opacity-100 transition hover:bg-rose-500 hover:text-white lg:opacity-0 lg:group-hover:opacity-100"
                aria-label={`Delete ${employee.display_name}`}
                title="Delete employee"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M9 3.75A1.75 1.75 0 0 1 10.75 2h2.5A1.75 1.75 0 0 1 15 3.75V4h3.25a.75.75 0 0 1 0 1.5h-.72l-.74 11.02A2.75 2.75 0 0 1 14.04 19H9.96a2.75 2.75 0 0 1-2.74-2.48L6.48 5.5h-.73a.75.75 0 0 1 0-1.5H9v-.25ZM10.75 3.5a.25.25 0 0 0-.25.25V4h3v-.25a.25.25 0 0 0-.25-.25h-2.5Zm-2.75 2L8.7 16.4c.04.6.54 1.1 1.14 1.1h4.32c.6 0 1.1-.5 1.14-1.1L15.99 5.5H8Zm3.25 2a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.75.75 0 0 1 .75-.75Zm-2.5.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0v-5.5Zm5 0a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0v-5.5Z" />
                </svg>
              </button>

              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25D366] to-emerald-900 text-sm font-semibold text-white">
                  {employee.display_name.slice(0, 2).toUpperCase()}
                </div>
                <span
                  className={['absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-[#0f1713]', statusTone(employee.status)].join(
                    ' '
                  )}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{employee.display_name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                  <span className="capitalize">{employee.status}</span>
                  <span className="opacity-50" aria-hidden="true">
                    |
                  </span>
                  <span className="capitalize">{employee.presence}</span>
                </div>
                {employee.session_status !== 'connected' ? (
                  <div className="mt-2 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                    Reconnect Required
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!employees.length ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-ink-400">No employees connected yet.</div> : null}
      </div>
    </aside>
  );
}
