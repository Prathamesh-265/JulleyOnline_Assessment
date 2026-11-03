import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

// Latest activity for a tenant; new entries are pushed in from the socket.
export default function useActivity(tenantId) {
  const [items, setItems] = useState([]);

  const load = useCallback(() => {
    if (!tenantId) return;
    api.get(`/activity?tenantId=${tenantId}&limit=40`).then(setItems).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    setItems([]);
    load();
  }, [load]);

  const push = useCallback((log) => setItems((list) => (list.some((x) => x.id === log.id) ? list : [log, ...list].slice(0, 100))), []);

  return { items, load, push };
}
