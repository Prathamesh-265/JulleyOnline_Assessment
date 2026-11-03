// Everything tenant-related funnels through here. A user's access to a tenant is
// derived from their memberships, never from an id the client sent.
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export const RANK = { MEMBER: 1, TENANT_ADMIN: 2, ORG_ADMIN: 3 };

// Highest role the user holds on this tenant: an org-level membership of the
// tenant's own organization, or a membership on the tenant itself. null = no access.
export async function roleInTenant(userId, tenantId) {
  // Prisma treats `undefined` in a filter as "no filter", which would match every membership
  if (!userId || !tenantId) return null;
  const rows = await prisma.membership.findMany({
    where: {
      userId,
      organization: { tenants: { some: { id: tenantId } } },
      OR: [{ tenantId: null }, { tenantId }],
    },
    select: { role: true },
  });
  return rows.reduce((best, { role }) => (!best || RANK[role] > RANK[best] ? role : best), null);
}

// 404 when the user can't see the tenant at all (so ids can't be probed), 403 when
// they can see it but their role is too low.
export async function requireRole(userId, tenantId, minRole = 'MEMBER') {
  const role = await roleInTenant(userId, tenantId);
  if (!role) throw new ApiError(404, 'Not found');
  if (RANK[role] < RANK[minRole]) throw new ApiError(403, 'Insufficient permissions');
  return role;
}

export async function requireOrgAdmin(userId, organizationId) {
  if (!userId || !organizationId) throw new ApiError(404, 'Not found');
  const rows = await prisma.membership.findMany({ where: { userId, organizationId }, select: { role: true } });
  if (!rows.length) throw new ApiError(404, 'Not found');
  if (!rows.some((r) => r.role === 'ORG_ADMIN')) throw new ApiError(403, 'Insufficient permissions');
}

// Fetch a board/column/task by id and check access using the row's own tenant_id.
export async function loadScoped(model, userId, id, { minRole = 'MEMBER', include } = {}) {
  const row = await prisma[model].findUnique({ where: { id }, include });
  if (!row) throw new ApiError(404, 'Not found');
  await requireRole(userId, row.tenantId, minRole);
  return row;
}

// The tree the org selector / tenant switcher renders: only what this user can reach.
export async function listWorkspaces(userId) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: { include: { tenants: { orderBy: { name: 'asc' } } } } },
  });

  const orgs = new Map();
  for (const m of memberships) {
    const org = orgs.get(m.organizationId) ?? {
      id: m.organization.id,
      name: m.organization.name,
      isOrgAdmin: false,
      tenants: new Map(),
    };
    orgs.set(org.id, org);

    const grant = (tenant, role) => {
      const current = org.tenants.get(tenant.id);
      if (!current || RANK[role] > RANK[current.role]) {
        org.tenants.set(tenant.id, { id: tenant.id, name: tenant.name, role });
      }
    };

    if (m.role === 'ORG_ADMIN') {
      org.isOrgAdmin = true;
      m.organization.tenants.forEach((t) => grant(t, 'ORG_ADMIN'));
    } else {
      const tenant = m.organization.tenants.find((t) => t.id === m.tenantId);
      if (tenant) grant(tenant, m.role);
    }
  }

  return [...orgs.values()].map((o) => ({ ...o, tenants: [...o.tenants.values()] }));
}
