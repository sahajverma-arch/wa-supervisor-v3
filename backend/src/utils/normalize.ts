import type { MessageKind } from '../types.js';

export function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeMessageKind(type?: string): MessageKind {
  switch (type) {
    case 'chat':
      return 'text';
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
    case 'location':
    case 'contact':
    case 'ptt':
      return type;
    default:
      return 'unknown';
  }
}
