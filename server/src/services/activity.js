import { emitToTenant } from '../sockets/index.js';

// `db` is either the prisma client or a transaction client, so the log row commits
// (or rolls back) together with the change it describes.
export const logActivity = (db, entry) =>
  db.activityLog.create({
    data: entry,
    include: { user: { select: { id: true, name: true } } },
  });

// Call after the transaction has committed: tell the tenant room what happened.
export function announce(tenantId, event, payload, log) {
  emitToTenant(tenantId, event, payload);
  if (log) emitToTenant(tenantId, 'activity:new', log);
}
