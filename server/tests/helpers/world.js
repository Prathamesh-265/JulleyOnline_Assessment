// Builds the cast every test file shares, through the public API only:
//   org A: tenants A1 and A2     org B: tenant B1
//   orgAdminA (org-level)   tenantAdminA1   memberA1   memberA2 (A2 only)
//   orgAdminB (org-level)   joiner, joiner2 (registered, no memberships yet)
import { call, http, ok } from './api.js';

const PASSWORD = 'Password@123';

export async function buildWorld() {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const users = {};

  for (const key of ['orgAdminA', 'tenantAdminA1', 'memberA1', 'memberA2', 'orgAdminB', 'joiner', 'joiner2']) {
    const email = `qa-${key.toLowerCase()}-${suffix}@kanban-test.dev`;
    const res = await call('POST', '/auth/register', { body: { name: `QA ${key}`, email, password: PASSWORD } });
    const body = ok(res, 201);
    users[key] = { id: body.user.id, name: `QA ${key}`, email, token: body.token, password: PASSWORD };
  }

  const orgA = ok(await http.post('/organizations', users.orgAdminA.token, { name: `QA Org A ${suffix}` }), 201);
  const A1 = ok(await http.post('/tenants', users.orgAdminA.token, { organizationId: orgA.id, name: 'A1 Hyderabad' }), 201);
  const A2 = ok(await http.post('/tenants', users.orgAdminA.token, { organizationId: orgA.id, name: 'A2 Bangalore' }), 201);
  const orgB = ok(await http.post('/organizations', users.orgAdminB.token, { name: `QA Org B ${suffix}` }), 201);
  const B1 = ok(await http.post('/tenants', users.orgAdminB.token, { organizationId: orgB.id, name: 'B1 Mumbai' }), 201);

  const add = (tenant, user, role) =>
    http.post(`/tenants/${tenant.id}/members`, users.orgAdminA.token, { email: user.email, role }).then((r) => ok(r, 201));
  await add(A1, users.tenantAdminA1, 'TENANT_ADMIN');
  await add(A1, users.memberA1, 'MEMBER');
  await add(A2, users.memberA2, 'MEMBER');

  return { suffix, users, orgA, orgB, A1, A2, B1 };
}

// Deleting an org cascades to its tenants, boards, tasks and logs.
export async function destroyWorld(w) {
  await http.del(`/organizations/${w.orgA.id}`, w.users.orgAdminA.token);
  await http.del(`/organizations/${w.orgB.id}`, w.users.orgAdminB.token);
}
