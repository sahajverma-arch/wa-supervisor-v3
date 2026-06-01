'use client';

type Props = {
  open: boolean;
  name: string | null;
  onCancel: () => void;
  onDelete: () => void;
};

export function ConfirmDeleteModal({ open, name, onCancel, onDelete }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0f1713] p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-white">Remove this employee and disconnect WhatsApp session?</h2>
        <p className="mt-2 text-sm text-ink-300">{name ?? 'This employee'} will be removed from the console and the WhatsApp session will be destroyed.</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onCancel} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white">
            Cancel
          </button>
          <button onClick={onDelete} className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
