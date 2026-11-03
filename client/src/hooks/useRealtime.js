import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '../services/socket';

const EVENTS = ['task:created', 'task:updated', 'task:moved', 'task:deleted', 'board:updated', 'activity:new', 'tenant:revoked'];

// Joins the tenant's room and wires server events to `handlers` (an object keyed by event name).
// A reconnect gives us a brand-new socket with no room and we may have missed events,
// so on every reconnect we re-join and call onResync to refetch.
export default function useRealtime(tenantId, handlers, onResync) {
  const [state, setState] = useState({ online: false, wasOnline: false, users: [] });
  const latest = useRef({ handlers, onResync });
  latest.current = { handlers, onResync };

  useEffect(() => {
    if (!tenantId) return;
    const socket = connectSocket();
    let firstJoin = true;

    const join = () =>
      socket.emit('tenant:join', { tenantId }, (res) => {
        if (!res?.ok) return setState((s) => ({ ...s, online: false }));
        setState({ online: true, wasOnline: true, users: res.users });
        if (!firstJoin) latest.current.onResync?.();
        firstJoin = false;
      });

    const onDisconnect = () => setState((s) => ({ ...s, online: false }));
    const onPresence = ({ users }) => setState((s) => ({ ...s, users }));
    const listeners = EVENTS.map((name) => [name, (payload) => latest.current.handlers[name]?.(payload)]);

    listeners.forEach(([name, fn]) => socket.on(name, fn));
    socket.on('presence:update', onPresence);
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();

    return () => {
      listeners.forEach(([name, fn]) => socket.off(name, fn));
      socket.off('presence:update', onPresence);
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.emit('tenant:leave');
      setState({ online: false, wasOnline: false, users: [] });
    };
  }, [tenantId]);

  return state;
}
