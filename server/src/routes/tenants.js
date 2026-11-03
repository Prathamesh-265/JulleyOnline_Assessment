import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { RANK, listWorkspaces, requireOrgAdmin, requireRole } from '../services/access.js';
import { closeTenantRoom, kickUser } from '../sockets/index.js';
import { ApiError } from '../utils/ApiError.js';
import { uuidParam } from '../utils/uuidParam.js';

const router = Router();
router.param('id', uuidParam);
router.param('userId', uuidParam);

const name = z.string().trim().min(1).max(120);
const createSchema = z.object({ organizationId: z.string().uuid(), name });
const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['MEMBER', 'TENANT_ADMIN']).default('MEMBER'),
});

router.post('/', async (req, res) => {
  const { organizationId, name } = createSchema.parse(req.body);
  await requireOrgAdmin(req.user.id, organizationId);
  res.status(201).json(await prisma.tenant.create({ data: { organizationId, name } }));
});

router.get('/', async (req, res) => {
  const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(req.query);
  const org = (await listWorkspaces(req.user.id)).find((o) => o.id === organizationId);
  if (!org) throw new ApiError(404, 'Not found');
  res.json(org.tenants);
});

router.get('/:id', async (req, res) => {
  await requireRole(req.user.id, req.params.id);
  res.json(await prisma.tenant.findUnique({ where: { id: req.params.id } }));
});

router.put('/:id', async (req, res) => {
  await requireRole(req.user.id, req.params.id, 'TENANT_ADMIN');
  const data = z.object({ name }).parse(req.body);
  res.json(await prisma.tenant.update({ where: { id: req.params.id }, data }));
});

router.delete('/:id', async (req, res) => {
  await requireRole(req.user.id, req.params.id, 'ORG_ADMIN');
  await prisma.tenant.delete({ where: { id: req.params.id } });
  closeTenantRoom(req.params.id);
  res.status(204).end();
});

// --- members -------------------------------------------------------------

router.get('/:id/members', async (req, res) => {
  const { id } = req.params;
  await requireRole(req.user.id, id);
  const rows = await prisma.membership.findMany({
    where: { organization: { tenants: { some: { id } } }, OR: [{ tenantId: null }, { tenantId: id }] },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // an org admin who is also a tenant member shows up once, with the higher role
  const byUser = new Map();
  for (const { user, role } of rows) {
    const seen = byUser.get(user.id);
    if (!seen || RANK[role] > RANK[seen.role]) byUser.set(user.id, { ...user, role });
  }
  res.json([...byUser.values()]);
});

router.post('/:id/members', async (req, res) => {
  const { email, role } = memberSchema.parse(req.body);
  const actorRole = await requireRole(req.user.id, req.params.id, 'TENANT_ADMIN');
  if (role === 'TENANT_ADMIN' && actorRole !== 'ORG_ADMIN') {
    throw new ApiError(403, 'Only an org admin can create tenant admins');
  }

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: req.params.id } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (!user) throw new ApiError(404, 'No user with that email');

  await prisma.membership.create({
    data: { userId: user.id, organizationId: tenant.organizationId, tenantId: tenant.id, role },
  });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const { id, userId } = req.params;
  const actorRole = await requireRole(req.user.id, id, 'TENANT_ADMIN');
  const membership = await prisma.membership.findFirst({ where: { userId, tenantId: id } });
  if (!membership) throw new ApiError(404, 'Not found');
  if (membership.role === 'TENANT_ADMIN' && actorRole !== 'ORG_ADMIN') {
    throw new ApiError(403, 'Only an org admin can remove a tenant admin');
  }

  await prisma.membership.delete({ where: { id: membership.id } });
  await kickUser(id, userId); // drop their live sockets right away
  res.status(204).end();
});

export default router;
