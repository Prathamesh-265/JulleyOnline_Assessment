import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireRole } from '../services/access.js';

const router = Router();

const querySchema = z.object({
  tenantId: z.string().uuid(),
  entityId: z.string().uuid().optional(), // e.g. one task's history for the details panel
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.date().optional(), // cursor: only entries older than this
});

router.get('/', async (req, res) => {
  const { tenantId, entityId, limit, before } = querySchema.parse(req.query);
  await requireRole(req.user.id, tenantId);

  res.json(
    await prisma.activityLog.findMany({
      where: { tenantId, ...(entityId && { entityId }), ...(before && { createdAt: { lt: before } }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    }),
  );
});

export default router;
