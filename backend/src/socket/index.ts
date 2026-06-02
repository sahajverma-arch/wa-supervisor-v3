import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { logger } from '../utils/logger.js';

let io: Server | null = null;

export function initializeSocket(server: HttpServer, clientOrigins: string[]) {
  io = new Server(server, {
    cors: {
      origin: clientOrigins,
      credentials: true
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true
  });

  io.on('connection', socket => {
    logger.info('SOCKET_CONNECTED', {
      socketId: socket.id,
      transport: socket.conn.transport.name
    });
    socket.emit('connected', { ok: true });

    socket.conn.on('upgrade', transport => {
      logger.info('SOCKET_UPGRADED', {
        socketId: socket.id,
        transport: transport.name
      });
    });

    socket.on('disconnect', reason => {
      logger.info('SOCKET_DISCONNECTED', {
        socketId: socket.id,
        reason
      });
    });
  });

  return io;
}

export function getSocketServer() {
  if (!io) {
    throw new Error('Socket server not initialized');
  }
  return io;
}
