import { io } from 'socket.io-client';
import { API_URL, getToken } from './api';

let socket = null;

// One shared connection. The token is read on every (re)connect, so a fresh login works.
export function connectSocket() {
  if (!socket) socket = io(API_URL, { auth: (cb) => cb({ token: getToken() }) });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
