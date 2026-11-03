import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { http, ok, uid, world } from './helpers/api.js';
import { makeBoard, makeTask } from './helpers/fixtures.js';

// Roles: Member < Tenant Admin < Org Admin. 403 = visible but not allowed.
describe('role-based access', () => {
  const w = world();
  const { orgAdminA, tenantAdminA1, memberA1, joiner, joiner2 } = w.users;
  let b;

  before(async () => {
    b = await makeBoard(tenantAdminA1.token, w.A1.id);
  });

  it('Member cannot create, rename or delete a board', async () => {
    assert.equal((await http.post('/boards', memberA1.token, { tenantId: w.A1.id, name: 'Nope' })).status, 403);
    assert.equal((await http.put(`/boards/${b.board.id}`, memberA1.token, { name: 'Nope' })).status, 403);
    assert.equal((await http.del(`/boards/${b.board.id}`, memberA1.token)).status, 403);
  });

  it('Tenant Admin creates a board with the four default columns', async () => {
    assert.deepEqual(b.columns.map((c) => c.name), ['To Do', 'In Progress', 'Testing', 'Done']);
  });

  it('Org Admin can act in a tenant without a tenant-level membership', async () => {
    const mine = await makeBoard(orgAdminA.token, w.A1.id);
    assert.ok(mine.board.id);
    ok(await http.get(`/tenants/${w.A1.id}/members`, orgAdminA.token));
  });

  it('Member cannot change columns', async () => {
    const col = b.col('To Do');
    assert.equal((await http.post('/columns', memberA1.token, { boardId: b.board.id, name: 'Nope' })).status, 403);
    assert.equal((await http.put(`/columns/${col.id}`, memberA1.token, { name: 'Nope' })).status, 403);
    assert.equal((await http.del(`/columns/${col.id}`, memberA1.token)).status, 403);
  });

  it('Member can create and edit tasks', async () => {
    const task = await makeTask(memberA1.token, b.board.id, b.col('To Do').id);
    ok(await http.put(`/tasks/${task.id}`, memberA1.token, { version: task.version, title: 'Edited by member' }));
  });

  it('Member can only delete their own tasks; Tenant Admin can delete any', async () => {
    const mine = await makeTask(memberA1.token, b.board.id, b.col('To Do').id);
    const adminsTask = await makeTask(tenantAdminA1.token, b.board.id, b.col('To Do').id);
    assert.equal((await http.del(`/tasks/${adminsTask.id}`, memberA1.token)).status, 403);
    assert.equal((await http.del(`/tasks/${mine.id}`, memberA1.token)).status, 204);
    assert.equal((await http.del(`/tasks/${adminsTask.id}`, tenantAdminA1.token)).status, 204);
    const other = await makeTask(memberA1.token, b.board.id, b.col('To Do').id);
    assert.equal((await http.del(`/tasks/${other.id}`, tenantAdminA1.token)).status, 204);
  });

  it('Only an Org Admin creates or deletes tenants and edits the organization', async () => {
    assert.equal((await http.post('/tenants', tenantAdminA1.token, { organizationId: w.orgA.id, name: 'Nope' })).status, 403);
    assert.equal((await http.post('/tenants', memberA1.token, { organizationId: w.orgA.id, name: 'Nope' })).status, 403);
    assert.equal((await http.del(`/tenants/${w.A1.id}`, tenantAdminA1.token)).status, 403);
    assert.equal((await http.put(`/organizations/${w.orgA.id}`, tenantAdminA1.token, { name: 'Nope' })).status, 403);
    assert.equal((await http.del(`/organizations/${w.orgA.id}`, tenantAdminA1.token)).status, 403);
  });

  it('Tenant Admin may rename their tenant, Member may not', async () => {
    assert.equal((await http.put(`/tenants/${w.A1.id}`, memberA1.token, { name: 'Nope' })).status, 403);
    assert.equal(ok(await http.put(`/tenants/${w.A1.id}`, tenantAdminA1.token, { name: 'A1 Hyderabad' })).name, 'A1 Hyderabad');
  });

  it('Member cannot add or remove members, but can see them', async () => {
    assert.equal((await http.post(`/tenants/${w.A1.id}/members`, memberA1.token, { email: joiner.email, role: 'MEMBER' })).status, 403);
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${tenantAdminA1.id}`, memberA1.token)).status, 403);
    assert.ok(ok(await http.get(`/tenants/${w.A1.id}/members`, memberA1.token)).length >= 3);
  });

  it('Tenant Admin adds Members but cannot create Tenant Admins', async () => {
    assert.equal((await http.post(`/tenants/${w.A1.id}/members`, tenantAdminA1.token, { email: joiner.email, role: 'TENANT_ADMIN' })).status, 403);
    ok(await http.post(`/tenants/${w.A1.id}/members`, tenantAdminA1.token, { email: joiner.email, role: 'MEMBER' }), 201);
    const list = ok(await http.get(`/tenants/${w.A1.id}/members`, memberA1.token));
    assert.equal(list.find((m) => m.id === joiner.id).role, 'MEMBER');
  });

  it('Org Admin creates Tenant Admins; only an Org Admin can remove one', async () => {
    ok(await http.post(`/tenants/${w.A1.id}/members`, orgAdminA.token, { email: joiner2.email, role: 'TENANT_ADMIN' }), 201);
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${joiner2.id}`, tenantAdminA1.token)).status, 403);
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${joiner2.id}`, orgAdminA.token)).status, 204);
  });

  it('Tenant Admin removes a Member', async () => {
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${joiner.id}`, tenantAdminA1.token)).status, 204);
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${joiner.id}`, tenantAdminA1.token)).status, 404);
  });

  it('a removed member loses access straight away', async () => {
    ok(await http.post(`/tenants/${w.A1.id}/members`, tenantAdminA1.token, { email: joiner.email, role: 'MEMBER' }), 201);
    assert.equal((await http.get(`/boards/${b.board.id}`, joiner.token)).status, 200);
    await http.del(`/tenants/${w.A1.id}/members/${joiner.id}`, tenantAdminA1.token);
    assert.equal((await http.get(`/boards/${b.board.id}`, joiner.token)).status, 404);
    assert.equal((await http.post('/tasks', joiner.token, { boardId: b.board.id, columnId: b.col('To Do').id, title: `x ${uid()}` })).status, 404);
  });
});
