'use client';

import type { Message } from '../types';

type Props = {
  message: Message;
};

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function MessageItem({ message }: Props) {
  const isInbound = message.direction === 'inbound';
  const wrapper = isInbound ? 'justify-start' : 'justify-end';
  const bubble = isInbound ? 'bg-white/8 text-white border border-white/8' : 'bg-[#25D366] text-[#06250f]';

  const body = message.body ?? message.caption ?? '';

  return (
    <div className={['flex w-full', wrapper].join(' ')}>
      <div className={['max-w-[80%] rounded-3xl px-4 py-3 shadow-lg', bubble].join(' ')}>
        {message.kind === 'image' && message.media_url ? <img src={message.media_url} alt={message.file_name ?? 'Image'} className="mb-2 max-h-80 rounded-2xl object-cover" /> : null}
        {message.kind === 'video' && message.media_url ? <video src={message.media_url} controls className="mb-2 max-h-80 w-full rounded-2xl" /> : null}
        {message.kind === 'audio' || message.kind === 'ptt' ? (
          <audio controls src={message.media_url ?? undefined} className="mb-2 w-full" />
        ) : null}
        {message.kind === 'document' && message.media_url ? (
          <a href={message.media_url} target="_blank" rel="noreferrer" className="mb-2 block rounded-2xl border border-black/10 bg-black/5 p-3 text-sm">
            {message.file_name ?? 'Document'}
          </a>
        ) : null}
        {body ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div> : null}
        {message.kind === 'location' ? <div className="text-sm">Location shared</div> : null}
        <div className={['mt-2 text-[11px]', isInbound ? 'text-ink-400' : 'text-[#114b21]'].join(' ')}>{timeLabel(message.message_timestamp)}</div>
      </div>
    </div>
  );
}
