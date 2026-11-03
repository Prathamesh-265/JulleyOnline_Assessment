import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { loadScoped } from '../services/access.js';
import { announce, logActivity } from '../services/activity.js';
import { POSITION_GAP } from '../services/tasks.js';
import { uuidParam } from '../utils/uuidParam.js';

const router = Router();
router.param('id', uuidParam);

const name = z.string().trim().min(1).max(80);
const createSchema = z.object({ boardId: z.string().uuid(), name });
const updateSchema = z
  .object({ name: name.optional(), position: z.number().finite().optional() })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');

// Columns are structure, so only tenant admins change them.
async function record(req, column, action, details) {
  const log = await logActivity(prisma, {
    tenantId: column.tenantId, userId: req.user.id, entityType: 'column', entityId: column.id, action, details,
  });
  announce(column.tenantId, 'board:updated', { boardId: column.boardId, action: 'columns', actorId: req.user.id }, log);
}

router.post('/', async (req, res) => {
  const { boardId, name } = createSchema.parse(req.body);
  const board = await loadScoped('board', req.user.id, boardId, { minRole: 'TENANT_ADMIN' });
  const last = await prisma.column.aggregate({ where: { boardId }, _max: { position: true } });

  const column = await prisma.column.create({
    data: { boardId, tenantId: board.tenantId, name, position: (last._max.position ?? 0) + POSITION_GAP },
  });
  await record(req, column, 'created', { name });
  res.status(201).json(column);
});

router.put('/:id', async (req, res) => {
  const existing = await loadScoped('column', req.user.id, req.params.id, { minRole: 'TENANT_ADMIN' });
  const data = updateSchema.parse(req.body);
  const column = await prisma.column.update({ where: { id: existing.id }, data });
  await record(req, column, 'updated', data);
  res.json(column);
});

router.delete('/:id', async (req, res) => {
  const column = await loadScoped('column', req.user.id, req.params.id, { minRole: 'TENANT_ADMIN' });
  if ((await prisma.task.count({ where: { columnId: column.id } })) > 0) {
    throw new ApiError(409, 'Move or delete the tasks in this column first');
  }
  await prisma.column.delete({ where: { id: column.id } });
  await record(req, column, 'deleted', { name: column.name });
  res.status(204).end();
});

export default router;
