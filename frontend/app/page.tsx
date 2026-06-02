'use client';

import { useSupervisor } from '../hooks/useSupervisor';
import { EmployeeSidebar } from '../components/EmployeeSidebar';
import { ChatList } from '../components/ChatList';
import { ConversationPane } from '../components/ConversationPane';
import { ConnectWhatsAppModal } from '../components/ConnectWhatsAppModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

export default function Page() {
  const supervisor = useSupervisor();

  return (
    <main className="h-screen overflow-hidden pb-24 text-white">
      <div className="grid h-full grid-cols-1 grid-rows-[18rem_20rem_minmax(0,1fr)] lg:grid-cols-[280px_340px_minmax(0,1fr)] lg:grid-rows-1">
        <div className="min-h-0">
          <EmployeeSidebar
            employees={supervisor.employees}
            selectedSessionKey={supervisor.selectedSessionKey}
            onSelect={supervisor.selectEmployee}
            onConnect={supervisor.connectEmployee}
            onResync={supervisor.resyncEmployee}
            onDelete={supervisor.requestDeleteEmployee}
          />
        </div>

        <div className="min-h-0">
          <ChatList
            chats={supervisor.chats}
            selectedChatId={supervisor.selectedChatId}
            search={supervisor.chatSearch}
            onSearchChange={supervisor.setChatSearch}
            onSelect={supervisor.selectChat}
          />
        </div>

        <div className="min-h-0">
          <ConversationPane employee={supervisor.selectedEmployee} chat={supervisor.selectedChat} messages={supervisor.messages} />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0f1713] p-3 lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={supervisor.connectEmployee} className="rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-[#06250f]">
            Connect WhatsApp
          </button>
          <button
            onClick={() => supervisor.setChatSearch('')}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white"
          >
            Clear Search
          </button>
        </div>
      </div>

      <ConnectWhatsAppModal
        open={supervisor.connectModalOpen}
        sessionKey={supervisor.connectSessionKey}
        employeeName={supervisor.connectEmployeeName}
        qrDataUrl={supervisor.connectQrDataUrl}
        onClose={() => supervisor.setConnectModalOpen(false)}
      />

      <ConfirmDeleteModal
        open={!!supervisor.deleteTarget}
        name={supervisor.deleteTarget?.display_name ?? null}
        onCancel={() => supervisor.requestDeleteEmployee(null)}
        onDelete={() => {
          supervisor.confirmDeleteEmployee().catch(() => undefined);
        }}
      />
    </main>
  );
}
