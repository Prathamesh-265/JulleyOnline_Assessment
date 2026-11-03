import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { listWorkspaces, requireOrgAdmin } from '../services/access.js';
import { closeTenantRoom } from '../sockets/index.js';
import { ApiError } from '../utils/ApiError.js';
import { uuidParam } from '../utils/uuidParam.js';

const router = Router();
router.param('id', uuidParam);

const bodySchema = z.object({ name: z.string().trim().min(1).max(120) });

// Anyone signed in can start an organization and becomes its Org Admin.
router.post('/', async (req, res) => {
  const { name } = bodySchema.parse(req.body);
  const org = await prisma.organization.create({
    data: { name, memberships: { create: { userId: req.user.id, role: 'ORG_ADMIN' } } },
  });
  res.status(201).json(org);
});

// Org -> tenants tree, limited to what this user can reach. Drives the selectors.
router.get('/', async (req, res) => res.json(await listWorkspaces(req.user.id)));

router.get('/:id', async (req, res) => {
  const org = (await listWorkspaces(req.user.id)).find((o) => o.id === req.params.id);
  if (!org) throw new ApiError(404, 'Not found');
  res.json(org);
});

router.put('/:id', async (req, res) => {
  await requireOrgAdmin(req.user.id, req.params.id);
  const { name } = bodySchema.parse(req.body);
  res.json(await prisma.organization.update({ where: { id: req.params.id }, data: { name } }));
});

router.delete('/:id', async (req, res) => {
  await requireOrgAdmin(req.user.id, req.params.id);
  const tenants = await prisma.tenant.findMany({ where: { organizationId: req.params.id }, select: { id: true } });
  await prisma.organization.delete({ where: { id: req.params.id } }); // cascades down the whole tree
  tenants.forEach((t) => closeTenantRoom(t.id));
  res.status(204).end();
});

export default router;
