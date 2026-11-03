import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { http, ok, uid, world } from './helpers/api.js';

describe('organizations and tenants', () => {
  const w = world();
  const owner = w.users.joiner; // makes their own org here, so they are an Org Admin of it only
  let org;
  let tenant;

  it('any signed-in user can create an organization and becomes its Org Admin', async () => {
    org = ok(await http.post('/organizations', owner.token, { name: `Joiner Org ${uid()}` }), 201);
    const mine = ok(await http.get('/organizations', owner.token));
    const entry = mine.find((o) => o.id === org.id);
    assert.ok(entry);
    assert.equal(entry.isOrgAdmin, true);
  });

  it('validates organization names', async () => {
    assert.equal((await http.post('/organizations', owner.token, { name: '' })).status, 400);
    assert.equal((await http.post('/organizations', owner.token, { name: '   ' })).status, 400);
    assert.equal((await http.post('/organizations', owner.token, { name: 'x'.repeat(121) })).status, 400);
    assert.equal((await http.post('/organizations', owner.token, {})).status, 400);
  });

  it('reads and renames an organization', async () => {
    assert.equal(ok(await http.get(`/organizations/${org.id}`, owner.token)).id, org.id);
    const renamed = ok(await http.put(`/organizations/${org.id}`, owner.token, { name: 'Renamed Org' }));
    assert.equal(renamed.name, 'Renamed Org');
  });

  it('bad ids: 400 for a malformed id, 404 for an unknown one', async () => {
    assert.equal((await http.get('/organizations/not-a-uuid', owner.token)).status, 400);
    assert.equal((await http.get('/organizations/00000000-0000-4000-8000-000000000000', owner.token)).status, 404);
  });

  it('an Org Admin creates tenants (branches)', async () => {
    tenant = ok(await http.post('/tenants', owner.token, { organizationId: org.id, name: 'Chennai' }), 201);
    assert.equal(tenant.organizationId, org.id);
    const list = ok(await http.get(`/tenants?organizationId=${org.id}`, owner.token));
    assert.ok(list.some((t) => t.id === tenant.id && t.role === 'ORG_ADMIN'));
  });

  it('validates tenant input', async () => {
    assert.equal((await http.post('/tenants', owner.token, { organizationId: org.id, name: '' })).status, 400);
    assert.equal((await http.post('/tenants', owner.token, { organizationId: 'nope', name: 'x' })).status, 400);
  });

  it('reads and renames a tenant', async () => {
    assert.equal(ok(await http.get(`/tenants/${tenant.id}`, owner.token)).name, 'Chennai');
    assert.equal(ok(await http.put(`/tenants/${tenant.id}`, owner.token, { name: 'Chennai HQ' })).name, 'Chennai HQ');
  });

  it('the member list includes the org admin', async () => {
    const members = ok(await http.get(`/tenants/${tenant.id}/members`, owner.token));
    const me = members.find((m) => m.id === owner.id);
    assert.equal(me.role, 'ORG_ADMIN');
    assert.equal(members.filter((m) => m.id === owner.id).length, 1);
  });

  it('adding a member needs an existing user', async () => {
    assert.equal((await http.post(`/tenants/${tenant.id}/members`, owner.token, { email: `nobody-${uid()}@kanban-test.dev`, role: 'MEMBER' })).status, 404);
    assert.equal((await http.post(`/tenants/${tenant.id}/members`, owner.token, { email: 'not-an-email', role: 'MEMBER' })).status, 400);
    assert.equal((await http.post(`/tenants/${tenant.id}/members`, owner.token, { email: w.users.joiner2.email, role: 'ORG_ADMIN' })).status, 400);
  });

  it('a user can belong to several tenants and sees only those', async () => {
    ok(await http.post(`/tenants/${tenant.id}/members`, owner.token, { email: w.users.joiner2.email, role: 'MEMBER' }), 201);
    const mine = ok(await http.get('/organizations', w.users.joiner2.token));
    const entry = mine.find((o) => o.id === org.id);
    assert.deepEqual(entry.tenants.map((t) => t.id), [tenant.id]);
    assert.equal(entry.isOrgAdmin, false);
  });

  it('deleting a tenant removes it, and its boards with it', async () => {
    const board = ok(await http.post('/boards', owner.token, { tenantId: tenant.id, name: 'Doomed' }), 201);
    assert.equal((await http.del(`/tenants/${tenant.id}`, owner.token)).status, 204);
    assert.equal((await http.get(`/tenants/${tenant.id}`, owner.token)).status, 404);
    assert.equal((await http.get(`/boards/${board.id}`, owner.token)).status, 404);
    assert.equal((await http.get(`/tenants/${tenant.id}`, w.users.joiner2.token)).status, 404);
  });

  it('deleting an organization removes everything under it', async () => {
    const t2 = ok(await http.post('/tenants', owner.token, { organizationId: org.id, name: 'Pune' }), 201);
    assert.equal((await http.del(`/organizations/${org.id}`, owner.token)).status, 204);
    assert.equal((await http.get(`/organizations/${org.id}`, owner.token)).status, 404);
    assert.equal((await http.get(`/tenants/${t2.id}`, owner.token)).status, 404);
  });
});
