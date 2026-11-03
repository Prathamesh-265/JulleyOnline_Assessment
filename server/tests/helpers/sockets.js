import { io } from 'socket.io-client';
import { API } from './api.js';

export function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, reconnection: false, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

export const join = (socket, tenantId) => new Promise((resolve) => socket.emit('tenant:join', { tenantId }, resolve));

// Resolves with the payload of the next matching event. Start it BEFORE the action that triggers it.
export function waitFor(socket, event, match = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, ms);
    function handler(payload) {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

// Resolves if the event does NOT arrive within `ms`, rejects if it does.
export function silence(socket, event, match = () => true, ms = 900) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
    function handler(payload) {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      reject(new Error(`Unexpected "${event}": ${JSON.stringify(payload)}`));
    }
    socket.on(event, handler);
  });
}
