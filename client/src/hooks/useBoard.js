// All board state lives here: loading, applying live events, drag-and-drop with
// optimistic updates, conflict handling and undo/redo.
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const GAP = 1024;
const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1);
const allTasks = (board) => board.columns.flatMap((c) => c.tasks);
const findTask = (board, id) => allTasks(board).find((t) => t.id === id);
// `id` can be a task id or a column id (dnd-kit reports either as the drop target)
const findColumn = (board, id) => board.columns.find((c) => c.id === id || c.tasks.some((t) => t.id === id));

// Put a task into a column right after `afterId` (null = top). Position is estimated
// locally so sorting stays consistent until the server answers with the real one.
function relocate(board, taskId, columnId, afterId) {
  const task = findTask(board, taskId);
  if (!task) return board;
  const columns = board.columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) }));
  const target = columns.find((c) => c.id === columnId);
  if (!target) return board;

  const at = afterId ? target.tasks.findIndex((t) => t.id === afterId) + 1 : 0;
  const prev = target.tasks[at - 1];
  const next = target.tasks[at];
  const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + GAP : next ? next.position - GAP : GAP;
  target.tasks.splice(at, 0, { ...task, columnId, position });
  return { ...board, columns };
}

// Insert or replace a task. An older version never overwrites a newer one (unless forced).
function upsert(board, task, force = false) {
  const existing = findTask(board, task.id);
  if (existing && !force && task.version < existing.version) return board;
  const columns = board.columns.map((c) => {
    const rest = c.tasks.filter((t) => t.id !== task.id);
    return c.id === task.columnId ? { ...c, tasks: [...rest, task].sort(byPosition) } : { ...c, tasks: rest };
  });
  return { ...board, columns };
}

const remove = (board, id) => ({ ...board, columns: board.columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== id) })) });
const sameValue = (key, a, b) => (key === 'dueDate' ? (a ?? '').slice(0, 10) === (b ?? '').slice(0, 10) : (a ?? null) === (b ?? null));

export default function useBoard(boardId, { onNotice, onGone, onBoardsChanged, members }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false });

  const ref = useRef(null); // always the latest board, even between renders
  const set = (next) => {
    ref.current = next;
    setBoard(next);
  };
  const update = (fn) => ref.current && set(fn(ref.current));

  const callbacks = useRef({});
  callbacks.current = { onNotice, onGone, onBoardsChanged, members };
  const notice = (msg) => callbacks.current.onNotice?.(msg);

  const drag = useRef(null); // { id, snapshot } while a card is being dragged
  const past = useRef([]);
  const future = useRef([]);
  const syncFlags = () => setFlags({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });
  const record = (entry) => {
    past.current = [...past.current.slice(-49), entry];
    future.current = [];
    syncFlags();
  };

  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!boardId) return set(null);
    const mine = ++requestId.current;
    try {
      const data = await api.get(`/boards/${boardId}`);
      if (mine === requestId.current) set(data);
    } catch (e) {
      if (e.status === 404) callbacks.current.onGone?.();
      else notice(e.message);
    }
  }, [boardId]);

  useEffect(() => {
    set(null);
    past.current = [];
    future.current = [];
    syncFlags();
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // --- conflicts -------------------------------------------------------------
  function handleFailure(e, taskId) {
    if (e.status === 409 && e.current) {
      update((b) => upsert(b, e.current, true));
      notice('Someone else changed that task first. Showing their version.');
    } else if (e.code === 'TASK_DELETED') {
      update((b) => remove(b, taskId));
      notice('That task was deleted by someone else.');
    } else {
      notice(e.message);
      load(); // fall back to the server's truth
    }
  }

  async function sendMove(taskId, columnId, afterId) {
    const task = findTask(ref.current, taskId);
    try {
      const saved = await api.patch(`/tasks/${taskId}/move`, { version: task.version, columnId, afterId });
      update((b) => upsert(b, saved, true));
      return true;
    } catch (e) {
      handleFailure(e, taskId);
      return false;
    }
  }

  // --- drag and drop -----------------------------------------------------------
  const dragStart = (id) => {
    drag.current = { id, snapshot: ref.current };
  };

  const dragOver = (activeId, overId) =>
    update((b) => {
      const from = findColumn(b, activeId);
      const to = findColumn(b, overId);
      if (!from || !to || from.id === to.id) return b;
      const overIndex = to.tasks.findIndex((t) => t.id === overId);
      const index = overIndex >= 0 ? overIndex : to.tasks.length;
      const moving = from.tasks.find((t) => t.id === activeId);
      return {
        ...b,
        columns: b.columns.map((c) => {
          if (c.id === from.id) return { ...c, tasks: c.tasks.filter((t) => t.id !== activeId) };
          if (c.id === to.id) return { ...c, tasks: [...c.tasks.slice(0, index), { ...moving, columnId: to.id }, ...c.tasks.slice(index)] };
          return c;
        }),
      };
    });

  const dragEnd = async (activeId, overId) => {
    const started = drag.current;
    drag.current = null;
    const b = ref.current;
    const col = b && findColumn(b, activeId);
    if (!started || !col) return;

    let tasks = col.tasks;
    const oldIndex = tasks.findIndex((t) => t.id === activeId);
    const newIndex = tasks.findIndex((t) => t.id === overId);
    if (newIndex >= 0 && newIndex !== oldIndex) {
      tasks = arrayMove(tasks, oldIndex, newIndex);
      set({ ...b, columns: b.columns.map((c) => (c.id === col.id ? { ...c, tasks } : c)) });
    }

    const to = { columnId: col.id, afterId: tasks[tasks.findIndex((t) => t.id === activeId) - 1]?.id ?? null };
    const origin = findColumn(started.snapshot, activeId);
    const from = { columnId: origin.id, afterId: origin.tasks[origin.tasks.findIndex((t) => t.id === activeId) - 1]?.id ?? null };
    if (from.columnId === to.columnId && from.afterId === to.afterId) return;

    if (await sendMove(activeId, to.columnId, to.afterId)) record({ type: 'move', taskId: activeId, from, to });
  };

  const dragCancel = () => {
    if (drag.current) set(drag.current.snapshot);
    drag.current = null;
  };

  // status dropdown in the task panel: send it to the bottom of that column
  async function moveToColumn(taskId, columnId) {
    const task = findTask(ref.current, taskId);
    if (!task || task.columnId === columnId) return;
    const origin = findColumn(ref.current, taskId);
    const from = { columnId: origin.id, afterId: origin.tasks[origin.tasks.findIndex((t) => t.id === taskId) - 1]?.id ?? null };
    const target = ref.current.columns.find((c) => c.id === columnId);
    const to = { columnId, afterId: target.tasks.at(-1)?.id ?? null };
    update((b) => relocate(b, taskId, to.columnId, to.afterId));
    if (await sendMove(taskId, to.columnId, to.afterId)) record({ type: 'move', taskId, from, to });
  }

  // --- task CRUD -----------------------------------------------------------------
  async function createTask(columnId, title) {
    try {
      const task = await api.post('/tasks', { boardId, columnId, title });
      update((b) => upsert(b, task));
    } catch (e) {
      notice(e.message);
    }
  }

  // `version` is the one the user was looking at when they started editing, so a
  // change made by someone else in the meantime produces a 409 instead of being overwritten.
  async function editTask(id, changes, { version, track = true } = {}) {
    const before = findTask(ref.current, id);
    if (!before) return null;
    const previous = Object.fromEntries(Object.keys(changes).map((k) => [k, before[k]]));
    const assignee = 'assignedTo' in changes ? (callbacks.current.members?.find((m) => m.id === changes.assignedTo) ?? null) : before.assignee;

    update((b) => upsert(b, { ...before, ...changes, assignee: assignee && { id: assignee.id, name: assignee.name } }, true)); // optimistic
    try {
      const saved = await api.put(`/tasks/${id}`, { version: version ?? before.version, ...changes });
      update((b) => upsert(b, saved, true));
      if (track) record({ type: 'update', taskId: id, before: previous, after: changes });
      return saved;
    } catch (e) {
      if (e.status !== 409) update((b) => upsert(b, before, true)); // roll back
      handleFailure(e, id);
      throw e;
    }
  }

  async function deleteTask(id) {
    try {
      await api.del(`/tasks/${id}`);
      update((b) => remove(b, id));
    } catch (e) {
      handleFailure(e, id);
    }
  }

  async function addColumn(name) {
    try {
      await api.post('/columns', { boardId, name });
      load();
    } catch (e) {
      notice(e.message);
    }
  }

  // --- undo / redo ------------------------------------------------------------------
  // Undo sends the inverse operation through the normal API, so it is subject to the
  // same permission and version checks. A field edit is only reverted if the task still
  // holds the values this user set; otherwise someone else has touched it and we leave it alone.
  async function replay(entry, dir) {
    const task = findTask(ref.current, entry.taskId);
    if (!task) return false;

    if (entry.type === 'move') {
      const target = dir === 'undo' ? entry.from : entry.to;
      update((b) => relocate(b, entry.taskId, target.columnId, target.afterId));
      return sendMove(entry.taskId, target.columnId, target.afterId);
    }

    const [expected, changes] = dir === 'undo' ? [entry.after, entry.before] : [entry.before, entry.after];
    if (Object.keys(expected).some((k) => !sameValue(k, task[k], expected[k]))) return false;
    try {
      await editTask(entry.taskId, changes, { track: false });
      return true;
    } catch {
      return false;
    }
  }

  async function step(from, to, dir) {
    const entry = from.current.pop();
    if (!entry) return;
    syncFlags();
    if (await replay(entry, dir)) to.current.push(entry);
    else notice(`Couldn't ${dir}: that task was changed or removed by someone else.`);
    syncFlags();
  }
  const undo = () => step(past, future, 'undo');
  const redo = () => step(future, past, 'redo');

  // --- live events from the socket ----------------------------------------------------
  const forThisBoard = (fn) => ({ task, ...rest }) => ref.current && (!task || task.boardId === boardId) && fn({ task, ...rest });
  const handlers = {
    'task:created': forThisBoard(({ task }) => update((b) => upsert(b, task))),
    'task:updated': forThisBoard(({ task }) => update((b) => upsert(b, task))),
    // don't yank a card out from under the user's pointer
    'task:moved': forThisBoard(({ task }) => drag.current?.id !== task.id && update((b) => upsert(b, task))),
    'task:deleted': ({ id }) => ref.current && update((b) => remove(b, id)),
    'board:updated': ({ boardId: changed, action }) => {
      if (changed === boardId) action === 'deleted' ? callbacks.current.onGone?.() : load();
      callbacks.current.onBoardsChanged?.();
    },
  };

  return { board, loading, load, handlers, ...flags, dragStart, dragOver, dragEnd, dragCancel, moveToColumn, createTask, editTask, deleteTask, addColumn, undo, redo };
}
