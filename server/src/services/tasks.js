// Task writes: optimistic locking (version), server-side ordering, activity log,
// and a broadcast once the transaction has committed.
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { loadScoped, requireRole, roleInTenant } from './access.js';
import { announce, logActivity } from './activity.js';

export const POSITION_GAP = 1024;
const MIN_GAP = 1e-6; // below this, midpoints stop being distinguishable: renumber the column
const withAssignee = { assignee: { select: { id: true, name: true } } };

async function assertAssignable(userId, tenantId) {
  if (!(await roleInTenant(userId, tenantId))) {
    throw new ApiError(400, 'Assignee does not belong to this tenant');
  }
}

// 409 with the latest copy (client can offer "reload"), or 404 if it was deleted meanwhile.
async function versionConflict(id, tenantId) {
  const current = await prisma.task.findFirst({ where: { id, tenantId }, include: withAssignee });
  return current
    ? new ApiError(409, 'Task was changed by someone else', { code: 'VERSION_CONFLICT', current })
    : new ApiError(404, 'Task was deleted by someone else', { code: 'TASK_DELETED' });
}

export async function listTasks(user, boardId) {
  const board = await loadScoped('board', user.id, boardId);
  return prisma.task.findMany({
    where: { boardId, tenantId: board.tenantId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: withAssignee,
  });
}

export const getTask = (user, id) => loadScoped('task', user.id, id, { include: withAssignee });

export async function createTask(user, input) {
  const board = await loadScoped('board', user.id, input.boardId);
  const column = await prisma.column.findFirst({ where: { id: input.columnId, boardId: board.id } });
  if (!column) throw new ApiError(400, 'Column does not belong to this board');
  if (input.assignedTo) await assertAssignable(input.assignedTo, board.tenantId);

  const { task, log } = await prisma.$transaction(async (tx) => {
    const last = await tx.task.aggregate({ where: { columnId: column.id }, _max: { position: true } });
    const task = await tx.task.create({
      data: {
        ...input,
        tenantId: board.tenantId, // always from the board, never from the request
        createdBy: user.id,
        position: (last._max.position ?? 0) + POSITION_GAP,
      },
      include: withAssignee,
    });
    const log = await logActivity(tx, {
      tenantId: board.tenantId,
      userId: user.id,
      entityType: 'task',
      entityId: task.id,
      action: 'created',
      details: { title: task.title, column: column.name },
    });
    return { task, log };
  });

  announce(board.tenantId, 'task:created', { task, actorId: user.id }, log);
  return task;
}

export async function updateTask(user, id, { version, ...changes }) {
  const existing = await loadScoped('task', user.id, id);
  if (existing.version !== version) throw await versionConflict(id, existing.tenantId);
  if (changes.assignedTo) await assertAssignable(changes.assignedTo, existing.tenantId);

  const diff = {};
  for (const key of Object.keys(changes)) {
    if (String(existing[key]) === String(changes[key])) continue;
    diff[key] = key === 'description' ? true : { from: existing[key], to: changes[key] };
  }

  const result = await prisma.$transaction(async (tx) => {
    // The version in the WHERE clause is the lock: if someone else got in first, count is 0.
    const { count } = await tx.task.updateMany({
      where: { id, tenantId: existing.tenantId, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (count === 0) return null;
    const task = await tx.task.findUnique({ where: { id }, include: withAssignee });
    const log = await logActivity(tx, {
      tenantId: existing.tenantId,
      userId: user.id,
      entityType: 'task',
      entityId: id,
      action: 'updated',
      details: { title: task.title, changed: diff },
    });
    return { task, log };
  });

  if (!result) throw await versionConflict(id, existing.tenantId);
  announce(existing.tenantId, 'task:updated', { task: result.task, actorId: user.id }, result.log);
  return result.task;
}

// Fractional ordering. The client says "put it right after task X" (or null = top of
// the column); the server works out the real neighbours itself, so a stale client view
// can't produce a broken order. Ties are harmless: reads sort by (position, id).
async function pickPosition(tx, { columnId, tenantId, afterId, movingId }, state) {
  const siblings = { columnId, tenantId, id: { not: movingId } };
  const edge = (dir) => tx.task.findFirst({ where: siblings, orderBy: { position: dir }, select: { position: true } });

  if (!afterId) {
    const first = await edge('asc');
    return first ? first.position - POSITION_GAP : POSITION_GAP;
  }

  const anchor = await tx.task.findFirst({ where: { id: afterId, columnId, tenantId }, select: { position: true } });
  if (!anchor) {
    // the task we were told to follow is gone or elsewhere: append instead
    const last = await edge('desc');
    return last ? last.position + POSITION_GAP : POSITION_GAP;
  }

  const next = await tx.task.findFirst({
    where: { ...siblings, position: { gt: anchor.position } },
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  if (!next) return anchor.position + POSITION_GAP;

  if (next.position - anchor.position < MIN_GAP) {
    const rows = await tx.task.findMany({
      where: { columnId, tenantId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const [i, row] of rows.entries()) {
      await tx.task.update({ where: { id: row.id }, data: { position: (i + 1) * POSITION_GAP } });
    }
    state.rebalanced = true;
    return pickPosition(tx, { columnId, tenantId, afterId, movingId }, state);
  }
  return (anchor.position + next.position) / 2;
}

export async function moveTask(user, id, { version, columnId, afterId }) {
  if (afterId === id) throw new ApiError(400, 'A task cannot be placed after itself');
  const task = await loadScoped('task', user.id, id);
  if (task.version !== version) throw await versionConflict(id, task.tenantId);

  const columns = await prisma.column.findMany({
    where: { boardId: task.boardId, id: { in: [task.columnId, columnId] } },
  });
  const target = columns.find((c) => c.id === columnId);
  const source = columns.find((c) => c.id === task.columnId);
  if (!target) throw new ApiError(400, 'Column does not belong to this board');

  const state = { rebalanced: false };
  const result = await prisma.$transaction(async (tx) => {
    const position = await pickPosition(tx, { columnId, tenantId: task.tenantId, afterId, movingId: id }, state);
    const { count } = await tx.task.updateMany({
      where: { id, tenantId: task.tenantId, version },
      data: { columnId, position, version: { increment: 1 } },
    });
    if (count === 0) return null;
    const moved = await tx.task.findUnique({ where: { id }, include: withAssignee });
    const log = await logActivity(tx, {
      tenantId: task.tenantId,
      userId: user.id,
      entityType: 'task',
      entityId: id,
      action: columnId === task.columnId ? 'reordered' : 'moved',
      details: { title: task.title, from: source?.name, to: target.name },
    });
    return { moved, log };
  }, { timeout: 15_000 }); // a renumber of a very long column can outlast the 5s default

  // a renumber changes other cards' positions too, so tell everyone to refetch
  if (state.rebalanced) announce(task.tenantId, 'board:updated', { boardId: task.boardId, action: 'rebalanced' });
  if (!result) throw await versionConflict(id, task.tenantId);

  announce(task.tenantId, 'task:moved', { task: result.moved, fromColumnId: task.columnId, actorId: user.id }, result.log);
  return result.moved;
}

export async function deleteTask(user, id) {
  const task = await loadScoped('task', user.id, id);
  const role = await requireRole(user.id, task.tenantId);
  if (role === 'MEMBER' && task.createdBy !== user.id) {
    throw new ApiError(403, 'Only the creator or an admin can delete this task');
  }

  const log = await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.deleteMany({ where: { id, tenantId: task.tenantId } });
    if (count === 0) throw new ApiError(404, 'Task was deleted by someone else', { code: 'TASK_DELETED' });
    return logActivity(tx, {
      tenantId: task.tenantId,
      userId: user.id,
      entityType: 'task',
      entityId: id,
      action: 'deleted',
      details: { title: task.title },
    });
  });

  announce(task.tenantId, 'task:deleted', { id, boardId: task.boardId, columnId: task.columnId, actorId: user.id }, log);
}
