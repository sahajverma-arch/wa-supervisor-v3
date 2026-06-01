'use client';

import { useEffect } from 'react';

type Props = {
  open: boolean;
  sessionKey: string | null;
  employeeName: string | null;
  qrDataUrl: string | null;
  onClose: () => void;
};

export function ConnectWhatsAppModal({ open, sessionKey, employeeName, qrDataUrl, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0f1713] p-6 shadow-soft">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-300">Connect Employee WhatsApp</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{employeeName ?? 'New employee'}</h2>
            <p className="mt-2 text-sm text-ink-300">Scan this QR code from the employee phone. The manager never sees WhatsApp Web.</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-sm text-ink-200 hover:bg-white/5">
            Close
          </button>
        </div>

        <div className="rounded-[1.5rem] bg-white p-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="WhatsApp QR code" className="mx-auto aspect-square w-full max-w-[280px]" />
          ) : (
            <div className="flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[1rem] border border-dashed border-ink-200 text-sm text-ink-500">
              Waiting for QR...
            </div>
          )}
        </div>

        <div className="mt-4 space-y-1 text-sm text-ink-300">
          <p>Session: {sessionKey ?? 'pending'}</p>
          <p>Status: {qrDataUrl ? 'QR ready' : 'Initializing connection'}</p>
        </div>
      </div>
    </div>
  );
}
