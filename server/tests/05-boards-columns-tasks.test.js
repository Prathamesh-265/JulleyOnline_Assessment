import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { http, ok, uid, world } from './helpers/api.js';
import { makeBoard, makeTask, tasksIn } from './helpers/fixtures.js';

describe('boards', () => {
  const w = world();
  const { tenantAdminA1: admin, memberA1: member } = w.users;
  let b;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id, 'CRUD board');
  });

  it('is created with description and shows up in the tenant list', async () => {
    const withDesc = ok(await http.post('/boards', admin.token, { tenantId: w.A1.id, name: 'Described', description: 'About it' }), 201);
    assert.equal(withDesc.description, 'About it');
    const list = ok(await http.get(`/boards?tenantId=${w.A1.id}`, member.token));
    assert.ok(list.some((x) => x.id === b.board.id) && list.some((x) => x.id === withDesc.id));
    assert.ok(list.every((x) => x.tenantId === w.A1.id));
  });

  it('validates input', async () => {
    assert.equal((await http.post('/boards', admin.token, { tenantId: w.A1.id, name: '' })).status, 400);
    assert.equal((await http.post('/boards', admin.token, { tenantId: w.A1.id, name: 'x'.repeat(121) })).status, 400);
    assert.equal((await http.post('/boards', admin.token, { tenantId: 'bad', name: 'x' })).status, 400);
    assert.equal((await http.get('/boards', admin.token)).status, 400);
    assert.equal((await http.get('/boards/not-a-uuid', admin.token)).status, 400);
  });

  it('returns columns in order, each with its tasks', async () => {
    const full = ok(await http.get(`/boards/${b.board.id}`, member.token));
    assert.deepEqual(full.columns.map((c) => c.name), ['To Do', 'In Progress', 'Testing', 'Done']);
    assert.ok(full.columns.every((c) => Array.isArray(c.tasks)));
    const positions = full.columns.map((c) => c.position);
    assert.deepEqual(positions, [...positions].sort((x, y) => x - y));
    assert.equal(ok(await http.get(`/boards/${b.board.id}/columns`, member.token)).length, 4);
  });

  it('can be renamed', async () => {
    assert.equal(ok(await http.put(`/boards/${b.board.id}`, admin.token, { name: 'Renamed board' })).name, 'Renamed board');
  });

  it('deleting a board cascades to its columns and tasks', async () => {
    const doomed = await makeBoard(admin.token, w.A1.id);
    const task = await makeTask(admin.token, doomed.board.id, doomed.col('To Do').id);
    assert.equal((await http.del(`/boards/${doomed.board.id}`, admin.token)).status, 204);
    assert.equal((await http.get(`/boards/${doomed.board.id}`, admin.token)).status, 404);
    assert.equal((await http.get(`/tasks/${task.id}`, admin.token)).status, 404);
    assert.equal((await http.get(`/boards?tenantId=${w.A1.id}`, admin.token)).body.some((x) => x.id === doomed.board.id), false);
  });
});

describe('columns', () => {
  const w = world();
  const { tenantAdminA1: admin } = w.users;
  let b;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
  });

  it('a new column is appended at the end', async () => {
    const col = ok(await http.post('/columns', admin.token, { boardId: b.board.id, name: 'Blocked' }), 201);
    assert.ok(col.position > b.col('Done').position);
    const names = ok(await http.get(`/boards/${b.board.id}/columns`, admin.token)).map((c) => c.name);
    assert.equal(names.at(-1), 'Blocked');
  });

  it('validates names', async () => {
    assert.equal((await http.post('/columns', admin.token, { boardId: b.board.id, name: '' })).status, 400);
    assert.equal((await http.post('/columns', admin.token, { boardId: b.board.id, name: 'x'.repeat(81) })).status, 400);
    assert.equal((await http.put(`/columns/${b.col('Done').id}`, admin.token, {})).status, 400);
  });

  it('renames and reorders', async () => {
    const renamed = ok(await http.put(`/columns/${b.col('Testing').id}`, admin.token, { name: 'QA' }));
    assert.equal(renamed.name, 'QA');
    const first = b.columns[0];
    ok(await http.put(`/columns/${b.col('Done').id}`, admin.token, { position: first.position - 10 }));
    const order = ok(await http.get(`/boards/${b.board.id}/columns`, admin.token)).map((c) => c.name);
    assert.equal(order[0], 'Done');
  });

  it('refuses to delete a column that still has tasks, then allows it once empty', async () => {
    const col = ok(await http.post('/columns', admin.token, { boardId: b.board.id, name: 'Temp' }), 201);
    const task = await makeTask(admin.token, b.board.id, col.id);
    assert.equal((await http.del(`/columns/${col.id}`, admin.token)).status, 409);
    ok(await http.del(`/tasks/${task.id}`, admin.token), 204);
    assert.equal((await http.del(`/columns/${col.id}`, admin.token)).status, 204);
    assert.equal((await http.del(`/columns/${col.id}`, admin.token)).status, 404);
  });
});

describe('tasks', () => {
  const w = world();
  const { tenantAdminA1: admin, memberA1: member } = w.users;
  let b;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
  });

  it('is created at the bottom of its column with version 1', async () => {
    const todo = b.col('To Do').id;
    const t1 = await makeTask(member.token, b.board.id, todo);
    const t2 = await makeTask(member.token, b.board.id, todo);
    assert.equal(t1.version, 1);
    assert.equal(t1.createdBy, member.id);
    assert.equal(t1.tenantId, w.A1.id);
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(t1.priority));
    assert.ok(t2.position > t1.position);
    assert.deepEqual((await tasksIn(member.token, b.board.id, todo)).slice(-2).map((t) => t.id), [t1.id, t2.id]);
  });

  it('stores every field', async () => {
    const due = '2030-01-15T00:00:00.000Z';
    const task = await makeTask(admin.token, b.board.id, b.col('In Progress').id, {
      title: 'Full task', description: 'Details', assignedTo: member.id, priority: 'HIGH', dueDate: due,
    });
    assert.equal(task.priority, 'HIGH');
    assert.equal(task.description, 'Details');
    assert.equal(task.assignee.name, member.name);
    assert.equal(new Date(task.dueDate).toISOString(), due);
    const read = ok(await http.get(`/tasks/${task.id}`, member.token));
    assert.equal(read.title, 'Full task');
  });

  it('validates input', async () => {
    const base = { boardId: b.board.id, columnId: b.col('To Do').id };
    assert.equal((await http.post('/tasks', member.token, { ...base, title: '' })).status, 400);
    assert.equal((await http.post('/tasks', member.token, { ...base, title: 'x'.repeat(201) })).status, 400);
    assert.equal((await http.post('/tasks', member.token, { ...base, title: 'ok', priority: 'URGENT' })).status, 400);
    assert.equal((await http.post('/tasks', member.token, { ...base, title: 'ok', dueDate: 'tomorrow-ish' })).status, 400);
    assert.equal((await http.post('/tasks', member.token, { ...base, columnId: 'bad', title: 'ok' })).status, 400);
    assert.equal((await http.get('/tasks', member.token)).status, 400);
  });

  it('updates part of a task and bumps the version', async () => {
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id, { title: 'Before' });
    const next = ok(await http.put(`/tasks/${task.id}`, member.token, { version: 1, title: 'After' }));
    assert.equal(next.title, 'After');
    assert.equal(next.version, 2);
    assert.equal(next.columnId, task.columnId);
    const again = ok(await http.put(`/tasks/${task.id}`, member.token, { version: 2, priority: 'LOW', assignedTo: admin.id }));
    assert.equal(again.version, 3);
    assert.equal(again.title, 'After');
    const cleared = ok(await http.put(`/tasks/${task.id}`, member.token, { version: 3, assignedTo: null, dueDate: null, description: '' }));
    assert.equal(cleared.assignedTo, null);
    assert.equal(cleared.dueDate, null);
  });

  it('refuses an update without a version or without changes', async () => {
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id);
    assert.equal((await http.put(`/tasks/${task.id}`, member.token, { title: 'no version' })).status, 400);
    assert.equal((await http.put(`/tasks/${task.id}`, member.token, { version: 1 })).status, 400);
    assert.equal((await http.put(`/tasks/${task.id}`, member.token, { version: 1, title: '' })).status, 400);
  });

  it('delete removes the task for good', async () => {
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id);
    assert.equal((await http.del(`/tasks/${task.id}`, member.token)).status, 204);
    assert.equal((await http.get(`/tasks/${task.id}`, member.token)).status, 404);
    assert.equal((await http.del(`/tasks/${task.id}`, member.token)).status, 404);
    const ids = ok(await http.get(`/tasks?boardId=${b.board.id}`, member.token)).map((t) => t.id);
    assert.ok(!ids.includes(task.id));
  });

  it('lists the tasks of one board only', async () => {
    const other = await makeBoard(admin.token, w.A1.id);
    const foreign = await makeTask(admin.token, other.board.id, other.col('To Do').id);
    const ids = ok(await http.get(`/tasks?boardId=${b.board.id}`, member.token)).map((t) => t.id);
    assert.ok(!ids.includes(foreign.id));
  });

  it('survives odd text safely (quotes, unicode, markup)', async () => {
    const title = `<script>alert(1)</script> "quoted" 'single' ; DROP TABLE tasks; -- ${uid()} 你好 🚀`;
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id, { title });
    assert.equal(ok(await http.get(`/tasks/${task.id}`, member.token)).title, title); // stored verbatim, escaped on render by React
  });
});
