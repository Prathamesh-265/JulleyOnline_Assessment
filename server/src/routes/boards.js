import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { loadScoped, requireRole } from '../services/access.js';
import { announce, logActivity } from '../services/activity.js';
import { POSITION_GAP } from '../services/tasks.js';
import { uuidParam } from '../utils/uuidParam.js';

const router = Router();
router.param('id', uuidParam);

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Testing', 'Done'];
const ordered = [{ position: 'asc' }, { id: 'asc' }];
const boardTree = {
  columns: { orderBy: ordered, include: { tasks: { orderBy: ordered, include: { assignee: { select: { id: true, name: true } } } } } },
};

const name = z.string().trim().min(1).max(120);
const description = z.string().max(1000);
const createSchema = z.object({ tenantId: z.string().uuid(), name, description: description.optional() });
const updateSchema = z.object({ name: name.optional(), description: description.optional() });

router.post('/', async (req, res) => {
  const { tenantId, name, description } = createSchema.parse(req.body);
  await requireRole(req.user.id, tenantId, 'TENANT_ADMIN');
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const { board, log } = await prisma.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: { tenantId, organizationId: tenant.organizationId, name, description, createdBy: req.user.id },
    });
    await tx.column.createMany({
      data: DEFAULT_COLUMNS.map((col, i) => ({ boardId: board.id, tenantId, name: col, position: (i + 1) * POSITION_GAP })),
    });
    const log = await logActivity(tx, {
      tenantId, userId: req.user.id, entityType: 'board', entityId: board.id, action: 'created', details: { name },
    });
    return { board, log };
  });

  announce(tenantId, 'board:updated', { boardId: board.id, action: 'created', actorId: req.user.id }, log);
  res.status(201).json(board);
});

router.get('/', async (req, res) => {
  const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(req.query);
  await requireRole(req.user.id, tenantId);
  res.json(await prisma.board.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }));
});

// The one call the board page needs: board + columns + tasks, in display order.
router.get('/:id', async (req, res) => {
  res.json(await loadScoped('board', req.user.id, req.params.id, { include: boardTree }));
});

router.get('/:id/columns', async (req, res) => {
  await loadScoped('board', req.user.id, req.params.id);
  res.json(await prisma.column.findMany({ where: { boardId: req.params.id }, orderBy: ordered }));
});

router.put('/:id', async (req, res) => {
  const board = await loadScoped('board', req.user.id, req.params.id, { minRole: 'TENANT_ADMIN' });
  const data = updateSchema.parse(req.body);

  const { updated, log } = await prisma.$transaction(async (tx) => {
    const updated = await tx.board.update({ where: { id: board.id }, data });
    const log = await logActivity(tx, {
      tenantId: board.tenantId, userId: req.user.id, entityType: 'board', entityId: board.id, action: 'updated', details: data,
    });
    return { updated, log };
  });

  announce(board.tenantId, 'board:updated', { boardId: board.id, action: 'updated', actorId: req.user.id }, log);
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const board = await loadScoped('board', req.user.id, req.params.id, { minRole: 'TENANT_ADMIN' });

  const log = await prisma.$transaction(async (tx) => {
    await tx.board.delete({ where: { id: board.id } }); // columns and tasks cascade
    return logActivity(tx, {
      tenantId: board.tenantId, userId: req.user.id, entityType: 'board', entityId: board.id, action: 'deleted', details: { name: board.name },
    });
  });

  announce(board.tenantId, 'board:updated', { boardId: board.id, action: 'deleted', actorId: req.user.id }, log);
  res.status(204).end();
});

export default router;
