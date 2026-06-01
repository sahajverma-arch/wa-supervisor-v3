import { randomUUID } from 'node:crypto';

export function createSessionKey() {
  return `session_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
