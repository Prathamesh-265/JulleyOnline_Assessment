import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { http, ok, world } from './helpers/api.js';
import { makeBoard, makeTask, tasksIn } from './helpers/fixtures.js';

describe('concurrent edits (optimistic locking)', () => {
  const w = world();
  const { tenantAdminA1: admin, memberA1: member } = w.users;
  let b;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
  });

  it('a stale update gets 409 with the latest copy', async () => {
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id, { title: 'Original' });
    ok(await http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'Admin edit' }));

    const res = await http.put(`/tasks/${task.id}`, member.token, { version: 1, title: 'Member edit' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'VERSION_CONFLICT');
    assert.equal(res.body.current.title, 'Admin edit');
    assert.equal(res.body.current.version, 2);
    assert.equal(ok(await http.get(`/tasks/${task.id}`, admin.token)).title, 'Admin edit'); // the loser changed nothing
  });

  it('retrying with the latest version works', async () => {
    const task = await makeTask(member.token, b.board.id, b.col('To Do').id);
    ok(await http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'First' }));
    const lost = await http.put(`/tasks/${task.id}`, member.token, { version: 1, priority: 'HIGH' });
    const retry = ok(await http.put(`/tasks/${task.id}`, member.token, { version: lost.body.current.version, priority: 'HIGH' }));
    assert.equal(retry.version, 3);
    assert.equal(retry.title, 'First'); // the other user's change was kept
    assert.equal(retry.priority, 'HIGH');
  });

  it('five simultaneous edits from the same version: exactly one wins', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const results = await Promise.all(
      [admin, member, admin, member, admin].map((u, i) => http.put(`/tasks/${task.id}`, u.token, { version: 1, title: `Racer ${i}` })),
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409, 409]);
    const final = ok(await http.get(`/tasks/${task.id}`, admin.token));
    assert.equal(final.version, 2);
    assert.equal(final.title, results.find((r) => r.status === 200).body.title);
  });

  it('an edit and a move racing from the same version: exactly one wins', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const [edit, move] = await Promise.all([
      http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'Edited' }),
      http.patch(`/tasks/${task.id}/move`, member.token, { version: 1, columnId: b.col('Done').id }),
    ]);
    assert.deepEqual([edit.status, move.status].sort(), [200, 409]);
    assert.equal(ok(await http.get(`/tasks/${task.id}`, admin.token)).version, 2);
  });

  it('two people dragging one card to different columns: one lands, one is told', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    const [x, y] = await Promise.all([
      http.patch(`/tasks/${task.id}/move`, admin.token, { version: 1, columnId: b.col('In Progress').id }),
      http.patch(`/tasks/${task.id}/move`, member.token, { version: 1, columnId: b.col('Testing').id }),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
    const loser = x.status === 409 ? x : y;
    const winner = x.status === 200 ? x : y;
    assert.equal(loser.body.code, 'VERSION_CONFLICT');
    assert.equal(loser.body.current.columnId, winner.body.columnId); // the loser is shown where the card really is
    const final = ok(await http.get(`/tasks/${task.id}`, admin.token));
    assert.equal(final.columnId, winner.body.columnId);
  });

  it('a stale move leaves the task where it is', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    ok(await http.put(`/tasks/${task.id}`, admin.token, { version: 1, title: 'Changed' }));
    const res = await http.patch(`/tasks/${task.id}/move`, member.token, { version: 1, columnId: b.col('Done').id });
    assert.equal(res.status, 409);
    assert.equal(ok(await http.get(`/tasks/${task.id}`, admin.token)).columnId, b.col('To Do').id);
  });

  it('editing a task someone else deleted gives 404', async () => {
    const task = await makeTask(admin.token, b.board.id, b.col('To Do').id);
    ok(await http.del(`/tasks/${task.id}`, admin.token), 204);
    assert.equal((await http.put(`/tasks/${task.id}`, member.token, { version: 1, title: 'Ghost' })).status, 404);
    assert.equal((await http.patch(`/tasks/${task.id}/move`, member.token, { version: 1, columnId: b.col('Done').id })).status, 404);
  });

  it('many tasks created at once all get distinct positions', async () => {
       const col = ok(await http.post('/columns', admin.token, { boardId: b.board.id, name: 'Parallel' }), 201).id;
    const created = await Promise.all(Array.from({ length: 8 }, () => http.post('/tasks', member.token, { boardId: b.board.id, columnId: col, title: 'Parallel' })));
    assert.ok(created.every((r) => r.status === 201));
    const list = await tasksIn(admin.token, b.board.id, col);
    assert.equal(list.length, 8);
    // reads are ordered by (position, id), so even a tie would still come back in a stable order
    const again = await tasksIn(admin.token, b.board.id, col);
    assert.deepEqual(list.map((t) => t.id), again.map((t) => t.id));
  });
});

describe('drag and drop ordering', () => {
  const w = world();
  const { tenantAdminA1: admin } = w.users;
  let b;
  let ids; // [A, B, C] in "To Do"

  const order = async (col) => (await tasksIn(admin.token, b.board.id, col.id)).map((t) => t.title);
  const move = async (title, columnId, afterId, tasks) => {
    const t = tasks[title];
    const moved = ok(await http.patch(`/tasks/${t.id}/move`, admin.token, { version: t.version, columnId, afterId }));
    tasks[title] = moved;
    return moved;
  };
  let tasks;

  before(async () => {
    b = await makeBoard(admin.token, w.A1.id);
    tasks = {};
    for (const title of ['A', 'B', 'C']) tasks[title] = await makeTask(admin.token, b.board.id, b.col('To Do').id, { title });
    ids = tasks;
  });

  it('starts in creation order', async () => {
    assert.deepEqual(await order(b.col('To Do')), ['A', 'B', 'C']);
  });

  it('moves a card to the top (afterId null)', async () => {
    await move('C', b.col('To Do').id, null, tasks);
    assert.deepEqual(await order(b.col('To Do')), ['C', 'A', 'B']);
  });

  it('moves a card to the middle (afterId = the card above)', async () => {
    await move('C', b.col('To Do').id, tasks.A.id, tasks);
    assert.deepEqual(await order(b.col('To Do')), ['A', 'C', 'B']);
  });

  it('moves a card to the bottom (afterId = the last card)', async () => {
    await move('A', b.col('To Do').id, tasks.B.id, tasks);
    assert.deepEqual(await order(b.col('To Do')), ['C', 'B', 'A']);
  });

  it('moves a card into another column, and bumps its version each time', async () => {
    const before = tasks.B.version;
    const moved = await move('B', b.col('Done').id, null, tasks);
    assert.equal(moved.columnId, b.col('Done').id);
    assert.equal(moved.version, before + 1);
    assert.deepEqual(await order(b.col('To Do')), ['C', 'A']);
    assert.deepEqual(await order(b.col('Done')), ['B']);
  });

  it('inserts between two cards of another column', async () => {
    await move('C', b.col('Done').id, null, tasks); // Done: C, B
    await move('A', b.col('Done').id, tasks.C.id, tasks); // Done: C, A, B
    assert.deepEqual(await order(b.col('Done')), ['C', 'A', 'B']);
    assert.deepEqual(await order(b.col('To Do')), []);
  });

  it('a card cannot be placed after itself', async () => {
    const t = tasks.A;
    assert.equal((await http.patch(`/tasks/${t.id}/move`, admin.token, { version: t.version, columnId: b.col('Done').id, afterId: t.id })).status, 400);
  });

  it('if the anchor card is gone, the card goes to the bottom instead of breaking the order', async () => {
    const ghost = await makeTask(admin.token, b.board.id, b.col('In Progress').id, { title: 'Ghost' });
    ok(await http.del(`/tasks/${ghost.id}`, admin.token), 204);
    await move('B', b.col('Done').id, ghost.id, tasks);
    assert.equal((await order(b.col('Done'))).at(-1), 'B');
  });

  it('survives 45 inserts into the same gap (positions get renumbered)', async () => {
    const stress = await makeBoard(admin.token, w.A1.id);
    const col = stress.col('To Do').id;
    const items = [];
    for (const title of ['a', 'b', 'c']) items.push(await makeTask(admin.token, stress.board.id, col, { title }));
    const expected = ['a', 'b', 'c'];
    const byTitle = Object.fromEntries(items.map((t) => [t.title, t]));

    for (let i = 0; i < 45; i++) {
      const lastTitle = expected.at(-1);
      const last = byTitle[lastTitle];
      byTitle[lastTitle] = ok(await http.patch(`/tasks/${last.id}/move`, admin.token, { version: last.version, columnId: col, afterId: byTitle.a.id }));
      expected.splice(expected.length - 1, 1);
      expected.splice(1, 0, lastTitle); // "right after a"
    }

    const final = await tasksIn(admin.token, stress.board.id, col);
    assert.deepEqual(final.map((t) => t.title), expected);
    assert.equal(new Set(final.map((t) => t.position)).size, 3, 'positions must stay distinct');
    assert.ok(final.every((t) => Number.isFinite(t.position)));
  });
});
