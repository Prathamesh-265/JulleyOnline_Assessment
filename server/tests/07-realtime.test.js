import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { http, ok, uid, world } from './helpers/api.js';
import { makeBoard, makeTask } from './helpers/fixtures.js';
import { connect, join, silence, waitFor } from './helpers/sockets.js';

describe('sockets: auth and rooms', () => {
  const w = world();
  const open = [];
  const track = (s) => (open.push(s), s);
  after(() => open.forEach((s) => s.close()));

  it('refuses a connection without a token or with a bad one', async () => {
    await assert.rejects(connect(undefined), /Unauthorized/);
    await assert.rejects(connect('abc.def.ghi'), /Unauthorized/);
  });

  it('accepts a valid token', async () => {
    const s = track(await connect(w.users.memberA1.token));
    assert.equal(s.connected, true);
  });

  it('only lets a user join tenants they belong to', async () => {
    const s = track(await connect(w.users.memberA2.token));
    assert.deepEqual(await join(s, w.A1.id), { ok: false, error: 'Forbidden' }); // same org, other branch
    assert.deepEqual(await join(s, w.B1.id), { ok: false, error: 'Forbidden' }); // other org
    assert.deepEqual(await join(s, '00000000-0000-4000-8000-000000000000'), { ok: false, error: 'Forbidden' });
    assert.equal((await join(s, 'not-a-uuid')).ok, false);
    const own = await join(s, w.A2.id);
    assert.equal(own.ok, true);
    assert.equal(own.role, 'MEMBER');
  });

  it('an Org Admin can join any tenant of their organization', async () => {
    const s = track(await connect(w.users.orgAdminA.token));
    const res = await join(s, w.A1.id);
    assert.equal(res.ok, true);
    assert.equal(res.role, 'ORG_ADMIN');
    assert.equal((await join(s, w.A2.id)).ok, true);
    assert.equal((await join(s, w.B1.id)).ok, false);
  });

  it('a socket that never joined receives nothing', async () => {
    const lurker = track(await connect(w.users.memberA1.token));
    const b = await makeBoard(w.users.tenantAdminA1.token, w.A1.id);
    const quiet = silence(lurker, 'task:created');
    await makeTask(w.users.tenantAdminA1.token, b.board.id, b.col('To Do').id);
    await quiet;
  });
});

describe('sockets: live events', () => {
  const w = world();
  const { tenantAdminA1: admin, memberA1: member, memberA2: outsider, orgAdminB } = w.users;
  let b;
  let sAdmin;
  let sMember;
  let sOutsider;
  let sOtherOrg;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
    [sAdmin, sMember, sOutsider, sOtherOrg] = await Promise.all([
      connect(admin.token), connect(member.token), connect(outsider.token), connect(orgAdminB.token),
    ]);
    await join(sAdmin, w.A1.id);
    await join(sMember, w.A1.id);
    await join(sOutsider, w.A2.id);
    await join(sOtherOrg, w.B1.id);
  });

  after(() => [sAdmin, sMember, sOutsider, sOtherOrg].forEach((s) => s?.close()));

  // every socket in the tenant hears it, nobody outside does
  async function expectBroadcast(event, action, match = () => true) {
    const heard = [waitFor(sAdmin, event, match), waitFor(sMember, event, match)];
    const quiet = [silence(sOutsider, event, match), silence(sOtherOrg, event, match)];
    const result = await action();
    const [payload] = await Promise.all(heard);
    await Promise.all(quiet);
    return { payload, result };
  }

  it('task:created reaches the tenant and nobody else', async () => {
    const { payload } = await expectBroadcast('task:created', () =>
      http.post('/tasks', admin.token, { boardId: b.board.id, columnId: b.col('To Do').id, title: 'Live one' }));
    assert.equal(payload.task.title, 'Live one');
    assert.equal(payload.actorId, admin.id);
  });

  it('task:updated carries the new version', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const { payload } = await expectBroadcast('task:updated', () =>
      http.put(`/tasks/${task.id}`, member.token, { version: 1, title: 'Renamed live' }), (p) => p.task.id === task.id);
    assert.equal(payload.task.title, 'Renamed live');
    assert.equal(payload.task.version, 2);
    assert.equal(payload.actorId, member.id);
  });

  it('task:moved says where it came from and where it is now', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const { payload } = await expectBroadcast('task:moved', () =>
      http.patch(`/tasks/${task.id}/move`, admin.token, { version: 1, columnId: b.col('Done').id }), (p) => p.task.id === task.id);
    assert.equal(payload.fromColumnId, b.col('To Do').id);
    assert.equal(payload.task.columnId, b.col('Done').id);
    assert.equal(payload.task.version, 2);
  });

  it('task:deleted carries the id', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const { payload } = await expectBroadcast('task:deleted', () => http.del(`/tasks/${task.id}`, admin.token), (p) => p.id === task.id);
    assert.equal(payload.boardId, b.board.id);
  });

  it('a rejected write (409) broadcasts nothing', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    ok(await http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'Winner' }));
    const quiet = silence(sMember, 'task:updated', (p) => p.task.id === task.id && p.task.title === 'Loser');
    assert.equal((await http.put(`/tasks/${task.id}`, member.token, { version: 1, title: 'Loser' })).status, 409);
    await quiet;
  });

  it('board:updated fires when columns change', async () => {
    const { payload } = await expectBroadcast('board:updated', () =>
      http.post('/columns', admin.token, { boardId: b.board.id, name: `Col ${uid()}` }), (p) => p.action === 'columns');
    assert.equal(payload.boardId, b.board.id);
  });

  it('activity:new streams the log entry with the user', async () => {
    const { payload } = await expectBroadcast('activity:new', () =>
      http.post('/tasks', member.token, { boardId: b.board.id, columnId: b.col('To Do').id, title: 'Logged live' }), (p) => p.details?.title === 'Logged live');
    assert.equal(payload.action, 'created');
    assert.equal(payload.user.id, member.id);
  });

  it('writes sent over the socket are ignored (REST is the only write path)', async () => {
    const before = ok(await http.get(`/tasks?boardId=${b.board.id}`, admin.token)).length;
    sMember.emit('task:create', { boardId: b.board.id, columnId: b.col('To Do').id, title: 'Sneaky' });
    sMember.emit('task:created', { task: { id: 'x', title: 'Fake' } });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(ok(await http.get(`/tasks?boardId=${b.board.id}`, admin.token)).length, before);
  });

  it('presence lists everyone online, and the same user in two tabs counts once', async () => {
    const tab2 = await connect(member.token);
    const update = waitFor(sAdmin, 'presence:update', (p) => p.users.some((u) => u.id === member.id));
    const ack = await join(tab2, w.A1.id);
    await update;
    assert.ok(ack.users.some((u) => u.id === admin.id));
    assert.equal(ack.users.filter((u) => u.id === member.id).length, 1);

    // closing one tab must not take the user offline while the other is open
    const after = waitFor(sAdmin, 'presence:update');
    tab2.close();
    const { users } = await after;
    assert.ok(users.some((u) => u.id === member.id));
    assert.equal(users.filter((u) => u.id === member.id).length, 1);
  });

  it('presence drops a user when their last socket goes away', async () => {
    const temp = await connect(w.users.orgAdminA.token);
    const joined = waitFor(sAdmin, 'presence:update', (p) => p.users.some((u) => u.id === w.users.orgAdminA.id));
    await join(temp, w.A1.id);
    await joined;
    const left = waitFor(sAdmin, 'presence:update', (p) => !p.users.some((u) => u.id === w.users.orgAdminA.id));
    temp.close();
    await left;
  });
});

describe('sockets: switching, revocation and recovery', () => {
  const w = world();
  const { tenantAdminA1: admin, orgAdminA, joiner } = w.users;
  let b;
  const open = [];
  const track = (s) => (open.push(s), s);
  after(() => open.forEach((s) => s.close()));

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
  });

  it('joining another tenant leaves the previous room', async () => {
    const s = track(await connect(orgAdminA.token));
    await join(s, w.A1.id);
    await join(s, w.A2.id);
    const quiet = silence(s, 'task:created');
    await makeTask(admin.token, b.board.id, b.col('To Do').id);
    await quiet;
  });

  it('tenant:leave stops events', async () => {
    const s = track(await connect(orgAdminA.token));
    await join(s, w.A1.id);
    s.emit('tenant:leave');
    await new Promise((r) => setTimeout(r, 300));
    const quiet = silence(s, 'task:created');
    await makeTask(admin.token, b.board.id, b.col('To Do').id);
    await quiet;
  });

  it('removing a member kicks their live socket out of the room', async () => {
    ok(await http.post(`/tenants/${w.A1.id}/members`, admin.token, { email: joiner.email, role: 'MEMBER' }), 201);
    const s = track(await connect(joiner.token));
    assert.equal((await join(s, w.A1.id)).ok, true);

    const revoked = waitFor(s, 'tenant:revoked', (p) => p.tenantId === w.A1.id);
    assert.equal((await http.del(`/tenants/${w.A1.id}/members/${joiner.id}`, admin.token)).status, 204);
    await revoked;

    const quiet = silence(s, 'task:created');
    await makeTask(admin.token, b.board.id, b.col('To Do').id);
    await quiet;
    assert.equal((await join(s, w.A1.id)).ok, false); // and cannot slip back in
  });

  it('deleting a tenant tells everyone in it', async () => {
    const tenant = ok(await http.post('/tenants', orgAdminA.token, { organizationId: w.orgA.id, name: `Temp ${uid()}` }), 201);
    const s = track(await connect(orgAdminA.token));
    await join(s, tenant.id);
    const revoked = waitFor(s, 'tenant:revoked', (p) => p.tenantId === tenant.id);
    assert.equal((await http.del(`/tenants/${tenant.id}`, orgAdminA.token)).status, 204);
    await revoked;
  });

  it('a reconnected socket has no room until it joins again, then gets events and can refetch', async () => {
    const s = track(await connect(admin.token));
    await join(s, w.A1.id);

    s.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    const missed = await makeTask(admin.token, b.board.id, b.col('To Do').id, { title: 'Made while offline' });

    await new Promise((resolve) => { s.once('connect', resolve); s.connect(); });
    const quiet = silence(s, 'task:created'); // fresh socket = no room yet
    await makeTask(admin.token, b.board.id, b.col('To Do').id);
    await quiet;

    assert.equal((await join(s, w.A1.id)).ok, true);
    const live = waitFor(s, 'task:created', (p) => p.task.title === 'After rejoin');
    await makeTask(admin.token, b.board.id, b.col('To Do').id, { title: 'After rejoin' });
    await live;

    // missed events are not replayed: the client has to refetch, and the data is all there
    const tasks = ok(await http.get(`/tasks?boardId=${b.board.id}`, admin.token));
    assert.ok(tasks.some((t) => t.id === missed.id));
  });
});
