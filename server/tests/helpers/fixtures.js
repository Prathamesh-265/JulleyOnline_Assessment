import { http, ok, uid } from './api.js';

export const COLUMN_NAMES = ['To Do', 'In Progress', 'Testing', 'Done'];

// A board with its default columns. `col('Done')` finds a column by name.
export async function makeBoard(token, tenantId, name = `Board ${uid()}`) {
  const board = ok(await http.post('/boards', token, { tenantId, name }), 201);
  const full = ok(await http.get(`/boards/${board.id}`, token));
  return { board, columns: full.columns, col: (n) => full.columns.find((c) => c.name === n) };
}

export const makeTask = async (token, boardId, columnId, extra = {}) =>
  ok(await http.post('/tasks', token, { boardId, columnId, title: `Task ${uid()}`, ...extra }), 201);

// tasks of one column in display order (the API already sorts by position)
export async function tasksIn(token, boardId, columnId) {
  const all = ok(await http.get(`/tasks?boardId=${boardId}`, token));
  return all.filter((t) => t.columnId === columnId);
}
