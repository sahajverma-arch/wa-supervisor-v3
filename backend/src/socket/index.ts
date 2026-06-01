import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';

let io: Server | null = null;

export function initializeSocket(server: HttpServer, clientOrigins: string[]) {
  io = new Server(server, {
    cors: {
      origin: clientOrigins,
      credentials: true
    }
  });

  io.on('connection', socket => {
    socket.emit('connected', { ok: true });
  });

  return io;
}

export function getSocketServer() {
  if (!io) {
    throw new Error('Socket server not initialized');
  }
  return io;
}
