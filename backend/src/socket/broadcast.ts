import { socketEventAliases, socketEvents } from './events.js';
import { getSocketServer } from './index.js';

type SocketEventKey = keyof typeof socketEvents;

export function emitRealtimeEvent<TPayload>(eventKey: SocketEventKey, payload: TPayload) {
  const io = getSocketServer();
  io.emit(socketEvents[eventKey], payload);

  const alias = socketEventAliases[eventKey as keyof typeof socketEventAliases];
  if (alias) {
    io.emit(alias, payload);
  }
}
