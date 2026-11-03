// Socket.IO is used for fan-out only. All writes go through the REST API, so every
// mutation passes the same auth/RBAC code. A socket can be in at most one tenant room,
// and the only way into a room is tenant:join, which re-checks membership.
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env.js';
import { userFromToken } from '../middleware/auth.js';
import { roleInTenant } from '../services/access.js';

let io;
const presence = new Map(); // tenantId -> Map(userId -> { id, name, sockets:Set })
const room = (tenantId) => `tenant:${tenantId}`;
const joinSchema = z.object({ tenantId: z.string().uuid() });

function addPresence(tenantId, user, socketId) {
  const users = presence.get(tenantId) ?? new Map();
  const entry = users.get(user.id) ?? { id: user.id, name: user.name, sockets: new Set() };
  entry.sockets.add(socketId);
  users.set(user.id, entry);
  presence.set(tenantId, users);
}

function removePresence(tenantId, userId, socketId) {
  const users = presence.get(tenantId);
  const entry = users?.get(userId);
  if (!entry) return;
  entry.sockets.delete(socketId);
  // several tabs = several sockets; only go offline when the last one is gone
  if (entry.sockets.size === 0) users.delete(userId);
  if (users.size === 0) presence.delete(tenantId);
}

const listPresence = (tenantId) => [...(presence.get(tenantId)?.values() ?? [])].map(({ id, name }) => ({ id, name }));
const broadcastPresence = (tenantId) => io.to(room(tenantId)).emit('presence:update', { users: listPresence(tenantId) });

function leaveTenant(socket) {
  const { tenantId, user } = socket.data;
  if (!tenantId) return;
  socket.leave(room(tenantId));
  socket.data.tenantId = null;
  removePresence(tenantId, user.id, socket.id);
  broadcastPresence(tenantId);
}

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigins },
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await userFromToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('tenant:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const { tenantId } = joinSchema.parse(payload);
        const role = await roleInTenant(socket.data.user.id, tenantId);
        if (!role) return reply({ ok: false, error: 'Forbidden' });

        leaveTenant(socket); // switching tenants drops the old room first
        socket.join(room(tenantId));
        socket.data.tenantId = tenantId;
        addPresence(tenantId, socket.data.user, socket.id);
        broadcastPresence(tenantId);
        reply({ ok: true, role, users: listPresence(tenantId) });
      } catch {
        reply({ ok: false, error: 'Invalid request' });
      }
    });

    socket.on('tenant:leave', () => leaveTenant(socket));
    socket.on('disconnect', () => leaveTenant(socket));
  });
}

export function emitToTenant(tenantId, event, payload) {
  io?.to(room(tenantId)).emit(event, payload);
}

// A membership was removed: push that user's sockets out of the room (unless an
// org-level membership still gives them access).
export async function kickUser(tenantId, userId) {
  if (!io || (await roleInTenant(userId, tenantId))) return;
  for (const s of await io.in(room(tenantId)).fetchSockets()) {
    if (s.data.user.id !== userId) continue;
    s.leave(room(tenantId));
    s.data.tenantId = null;
    s.emit('tenant:revoked', { tenantId });
  }
  presence.get(tenantId)?.delete(userId);
  broadcastPresence(tenantId);
}

// Tenant deleted: close its room.
export function closeTenantRoom(tenantId) {
  io?.to(room(tenantId)).emit('tenant:revoked', { tenantId });
  io?.in(room(tenantId)).socketsLeave(room(tenantId));
  presence.delete(tenantId);
}
