import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { http, ok, world } from './helpers/api.js';
import { makeBoard, makeTask } from './helpers/fixtures.js';

describe('activity log', () => {
  const w = world();
  const { tenantAdminA1: admin, memberA1: member, memberA2 } = w.users;
  let b;
  let task;
  const history = (query = '') => http.get(`/activity?tenantId=${w.A1.id}${query}`, member.token).then((r) => ok(r));
  const forTask = (id) => history(`&entityId=${id}`);

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
    task = await makeTask(member.token, b.board.id, b.col('To Do').id, { title: 'Tracked' });
    const edited = ok(await http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'Tracked v2', priority: 'HIGH' }));
    const moved = ok(await http.patch(`/tasks/${task.id}/move`, member.token, { version: edited.version, columnId: b.col('Testing').id }));
    const other = await makeTask(admin.token, b.board.id, b.col('Testing').id, { title: 'Sibling' });
    ok(await http.patch(`/tasks/${task.id}/move`, member.token, { version: moved.version, columnId: b.col('Testing').id, afterId: other.id }));
  });

  it('logs creation with who did it', async () => {
    const entries = await forTask(task.id);
    const created = entries.find((e) => e.action === 'created');
    assert.equal(created.entityType, 'task');
    assert.equal(created.user.id, member.id);
    assert.equal(created.details.column, 'To Do');
  });

  it('logs edits with before and after values', async () => {
    const updated = (await forTask(task.id)).find((e) => e.action === 'updated');
    assert.equal(updated.user.id, admin.id);
    assert.deepEqual(updated.details.changed.title, { from: 'Tracked', to: 'Tracked v2' });
    assert.equal(updated.details.changed.priority.to, 'HIGH');
  });

  it('logs moves between columns and reorders within one', async () => {
    const entries = await forTask(task.id);
    const moved = entries.find((e) => e.action === 'moved');
    assert.equal(moved.details.from, 'To Do');
    assert.equal(moved.details.to, 'Testing');
    assert.ok(entries.some((e) => e.action === 'reordered'));
  });

  it('is newest first', async () => {
    const entries = await forTask(task.id);
    const times = entries.map((e) => new Date(e.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((x, y) => y - x));
    assert.equal(entries.at(-1).action, 'created');
  });

  it('entityId only returns that task', async () => {
    const entries = await forTask(task.id);
    assert.ok(entries.length >= 4);
    assert.ok(entries.every((e) => e.entityId === task.id));
  });

  it('logs deletions, and board and column changes', async () => {
    const gone = await makeTask(member.token, b.board.id, b.col('To Do').id, { title: 'Short lived' });
    ok(await http.del(`/tasks/${gone.id}`, member.token), 204);
    assert.ok((await forTask(gone.id)).some((e) => e.action === 'deleted'));

    const col = ok(await http.post('/columns', admin.token, { boardId: b.board.id, name: 'Logged column' }), 201);
    assert.ok((await forTask(col.id)).some((e) => e.entityType === 'column' && e.action === 'created'));
    assert.ok((await forTask(b.board.id)).some((e) => e.entityType === 'board' && e.action === 'created'));
  });

  it('supports limit and validates it', async () => {
    assert.equal((await history('&limit=2')).length, 2);
    assert.equal((await http.get(`/activity?tenantId=${w.A1.id}&limit=0`, member.token)).status, 400);
    assert.equal((await http.get(`/activity?tenantId=${w.A1.id}&limit=101`, member.token)).status, 400);
    assert.equal((await http.get(`/activity?tenantId=${w.A1.id}&limit=abc`, member.token)).status, 400);
    assert.equal((await http.get('/activity', member.token)).status, 400); // tenantId is required
  });

  it('pages backwards with the "before" cursor without repeating entries', async () => {
    const first = await history('&limit=3');
    const cursor = first.at(-1).createdAt;
    const next = await history(`&limit=3&before=${encodeURIComponent(cursor)}`);
    assert.ok(next.length > 0);
    const seen = new Set(first.map((e) => e.id));
    assert.ok(next.every((e) => !seen.has(e.id) && new Date(e.createdAt) < new Date(cursor)));
  });

  it('is scoped to the tenant', async () => {
    assert.equal((await http.get(`/activity?tenantId=${w.A1.id}`, memberA2.token)).status, 404);
    const a2 = ok(await http.get(`/activity?tenantId=${w.A2.id}`, memberA2.token));
    assert.ok(a2.every((e) => e.entityId !== task.id));
    assert.ok((await history('&limit=100')).every((e) => e.user?.id));
  });
});
