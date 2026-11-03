import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { call, http, ok, world } from './helpers/api.js';
import { makeBoard, makeTask } from './helpers/fixtures.js';

// Strict tenant isolation. Anything the caller can't reach must look like it doesn't exist (404).
describe('tenant and organization isolation', () => {
  const w = world();
  const { orgAdminA, tenantAdminA1, memberA1, memberA2, orgAdminB, joiner } = w.users;
  let a1; // board in A1
  let a1Task;
  let b1; // board in B1 (other organization)
  let b1Task;

  before(async () => {
    a1 = await makeBoard(tenantAdminA1.token, w.A1.id);
    a1Task = await makeTask(tenantAdminA1.token, a1.board.id, a1.col('To Do').id, { title: 'Secret A1 task' });
    b1 = await makeBoard(orgAdminB.token, w.B1.id);
    b1Task = await makeTask(orgAdminB.token, b1.board.id, b1.col('To Do').id, { title: 'Secret B1 task' });
  });

  // memberA2: same org, other branch.  orgAdminB: other org.  joiner: admin of an unrelated org (or nothing).
  const outsiders = () => [
    ['same org, other tenant', memberA2],
    ['other organization', orgAdminB],
    ['unrelated user', joiner],
  ];

  it('outsiders cannot read anything in tenant A1', async () => {
    for (const [label, user] of outsiders()) {
      const reads = [
        `/boards?tenantId=${w.A1.id}`,
        `/boards/${a1.board.id}`,
        `/boards/${a1.board.id}/columns`,
        `/tasks?boardId=${a1.board.id}`,
        `/tasks/${a1Task.id}`,
        `/tenants/${w.A1.id}`,
        `/tenants/${w.A1.id}/members`,
        `/activity?tenantId=${w.A1.id}`,
        `/activity?tenantId=${w.A1.id}&entityId=${a1Task.id}`,
      ];
      for (const path of reads) {
        const res = await http.get(path, user.token);
        assert.equal(res.status, 404, `${label}: GET ${path} gave ${res.status}`);
        assert.ok(!JSON.stringify(res.body).includes('Secret A1 task'), `${label}: leaked task title via ${path}`);
      }
    }
  });

  it('outsiders cannot write anything in tenant A1', async () => {
    for (const [label, user] of outsiders()) {
      const writes = [
        ['POST', '/boards', { tenantId: w.A1.id, name: 'Intruder' }],
        ['PUT', `/boards/${a1.board.id}`, { name: 'Hacked' }],
        ['DELETE', `/boards/${a1.board.id}`],
        ['POST', '/columns', { boardId: a1.board.id, name: 'Intruder' }],
        ['PUT', `/columns/${a1.col('Done').id}`, { name: 'Hacked' }],
        ['DELETE', `/columns/${a1.col('Done').id}`],
        ['POST', '/tasks', { boardId: a1.board.id, columnId: a1.col('To Do').id, title: 'Intruder' }],
        ['PUT', `/tasks/${a1Task.id}`, { version: 1, title: 'Hacked' }],
        ['PATCH', `/tasks/${a1Task.id}/move`, { version: 1, columnId: a1.col('Done').id }],
        ['DELETE', `/tasks/${a1Task.id}`],
        ['POST', `/tenants/${w.A1.id}/members`, { email: user.email, role: 'MEMBER' }],
        ['DELETE', `/tenants/${w.A1.id}/members/${memberA1.id}`],
        ['PUT', `/tenants/${w.A1.id}`, { name: 'Hacked' }],
        ['DELETE', `/tenants/${w.A1.id}`],
      ];
      for (const [method, path, body] of writes) {
        const res = await call(method, path, { token: user.token, body });
        assert.equal(res.status, 404, `${label}: ${method} ${path} gave ${res.status}`);
      }
    }
  });

  it('after the attacks, tenant A1 data is untouched', async () => {
    const task = ok(await http.get(`/tasks/${a1Task.id}`, tenantAdminA1.token));
    assert.equal(task.title, 'Secret A1 task');
    assert.equal(task.version, 1);
    assert.equal(ok(await http.get(`/boards/${a1.board.id}`, tenantAdminA1.token)).columns.length, 4);
    assert.equal(ok(await http.get(`/tenants/${w.A1.id}`, tenantAdminA1.token)).name, 'A1 Hyderabad');
  });

  it('another organization is invisible and untouchable', async () => {
    assert.equal((await http.get(`/organizations/${w.orgA.id}`, orgAdminB.token)).status, 404);
    assert.equal((await http.put(`/organizations/${w.orgA.id}`, orgAdminB.token, { name: 'Hacked' })).status, 404);
    assert.equal((await http.del(`/organizations/${w.orgA.id}`, orgAdminB.token)).status, 404);
    assert.equal((await http.post('/tenants', orgAdminB.token, { organizationId: w.orgA.id, name: 'Intruder' })).status, 404);
    assert.equal((await http.get(`/tenants?organizationId=${w.orgA.id}`, orgAdminB.token)).status, 404);
  });

  it('organization lists only contain what the caller can reach', async () => {
    const asB = JSON.stringify(ok(await http.get('/organizations', orgAdminB.token)));
    assert.ok(!asB.includes(w.orgA.id) && !asB.includes(w.A1.id) && !asB.includes(w.A2.id));

    const asM1 = ok(await http.get('/organizations', memberA1.token));
    assert.deepEqual(asM1.find((o) => o.id === w.orgA.id).tenants.map((t) => t.id), [w.A1.id]);
    const asM2 = ok(await http.get('/organizations', memberA2.token));
    assert.deepEqual(asM2.find((o) => o.id === w.orgA.id).tenants.map((t) => t.id), [w.A2.id]);
    assert.deepEqual(ok(await http.get(`/tenants?organizationId=${w.orgA.id}`, memberA1.token)).map((t) => t.id), [w.A1.id]);

    const asAdmin = ok(await http.get(`/tenants?organizationId=${w.orgA.id}`, orgAdminA.token)).map((t) => t.id);
    assert.ok(asAdmin.includes(w.A1.id) && asAdmin.includes(w.A2.id));
  });

  it('the member list never shows people from other tenants or organizations', async () => {
    const ids = ok(await http.get(`/tenants/${w.A1.id}/members`, memberA1.token)).map((m) => m.id);
    assert.ok(ids.includes(memberA1.id) && ids.includes(tenantAdminA1.id) && ids.includes(orgAdminA.id));
    assert.ok(!ids.includes(memberA2.id) && !ids.includes(orgAdminB.id));
  });

  it('ids from another tenant are rejected even for an insider', async () => {
    // column from a board in another organization
    const res = await http.post('/tasks', tenantAdminA1.token, { boardId: a1.board.id, columnId: b1.col('To Do').id, title: 'Cross' });
    assert.equal(res.status, 400);

    // column from another board in the same tenant
    const other = await makeBoard(tenantAdminA1.token, w.A1.id);
    const move = await http.patch(`/tasks/${a1Task.id}/move`, tenantAdminA1.token, { version: 1, columnId: other.col('Done').id });
    assert.equal(move.status, 400);
    assert.equal(ok(await http.get(`/tasks/${a1Task.id}`, tenantAdminA1.token)).columnId, a1.col('To Do').id);
  });

  it('assignees must belong to the tenant', async () => {
    for (const stranger of [memberA2, orgAdminB, joiner]) {
      const res = await http.put(`/tasks/${a1Task.id}`, tenantAdminA1.token, { version: 1, assignedTo: stranger.id });
      assert.equal(res.status, 400);
    }
    const created = await http.post('/tasks', tenantAdminA1.token, { boardId: a1.board.id, columnId: a1.col('To Do').id, title: 'x', assignedTo: memberA2.id });
    assert.equal(created.status, 400);
    // an org admin counts as part of every tenant of their org
    const task = ok(await http.put(`/tasks/${a1Task.id}`, tenantAdminA1.token, { version: 1, assignedTo: orgAdminA.id }));
    assert.equal(task.assignee.id, orgAdminA.id);
  });

  it('a client cannot choose the tenant of a new or updated task', async () => {
    const created = ok(await http.post('/tasks', memberA1.token, {
      boardId: a1.board.id, columnId: a1.col('To Do').id, title: 'Tenant tamper', tenantId: w.B1.id, createdBy: orgAdminB.id,
    }), 201);
    assert.equal(created.tenantId, w.A1.id);
    assert.equal(created.createdBy, memberA1.id);
    const updated = ok(await http.put(`/tasks/${created.id}`, memberA1.token, { version: 1, title: 'Still mine', tenantId: w.B1.id, boardId: b1.board.id }));
    assert.equal(updated.tenantId, w.A1.id);
    assert.equal(updated.boardId, a1.board.id);
  });

  it("B1's data is also safe from tenant A people", async () => {
    for (const user of [tenantAdminA1, memberA1, orgAdminA]) {
      assert.equal((await http.get(`/tasks/${b1Task.id}`, user.token)).status, 404);
      assert.equal((await http.get(`/boards/${b1.board.id}`, user.token)).status, 404);
    }
  });

  it('activity filtered by a foreign entity id leaks nothing', async () => {
    const res = ok(await http.get(`/activity?tenantId=${w.A1.id}&entityId=${b1Task.id}`, tenantAdminA1.token));
    assert.deepEqual(res, []);
  });

  it('a member of two tenants sees both, and nothing else', async () => {
    ok(await http.post(`/tenants/${w.A2.id}/members`, orgAdminA.token, { email: memberA1.email, role: 'MEMBER' }), 201);
    const org = ok(await http.get('/organizations', memberA1.token)).find((o) => o.id === w.orgA.id);
    assert.deepEqual(org.tenants.map((t) => t.id).sort(), [w.A1.id, w.A2.id].sort());
    await http.del(`/tenants/${w.A2.id}/members/${memberA1.id}`, orgAdminA.token);
    const after = ok(await http.get('/organizations', memberA1.token)).find((o) => o.id === w.orgA.id);
    assert.deepEqual(after.tenants.map((t) => t.id), [w.A1.id]);
  });
});
