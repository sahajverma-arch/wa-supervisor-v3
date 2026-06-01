import { io, type Socket } from 'socket.io-client';

function getSocketUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!backendUrl) {
    throw new Error('NEXT_PUBLIC_SOCKET_URL is required');
  }
  return backendUrl;
}

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(getSocketUrl(), {
      transports: ['websocket'],
      autoConnect: true
    });
  }
  return socket;
}
