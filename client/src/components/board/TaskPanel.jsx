import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ActivityList } from '../collab/ActivityLog';
import Drawer from '../ui/Drawer';

const toForm = (t) => ({
  title: t.title,
  description: t.description,
  assignedTo: t.assignedTo ?? '',
  priority: t.priority,
  dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
});

export default function TaskPanel({ task, columns, members, tenantId, canDelete, onSave, onMove, onDelete, onClose }) {
  const [form, setForm] = useState(() => toForm(task));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState([]);

  // what the form was last synced with: the version we are editing on top of
  const base = useRef({ version: task.version, form: toForm(task) });
  const dirty = JSON.stringify(form) !== JSON.stringify(base.current.form);
  const stale = task.version !== base.current.version;

  const loadLatest = () => {
    base.current = { version: task.version, form: toForm(task) };
    setForm(base.current.form);
    setError('');
  };

  // someone else changed the task: follow along silently unless the user has unsaved edits
  useEffect(() => {
    if (stale && !dirty) loadLatest();
  }, [task.version]);

  useEffect(() => {
    api.get(`/activity?tenantId=${tenantId}&entityId=${task.id}&limit=15`).then(setHistory).catch(() => {});
  }, [task.id, task.version]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const changes = {};
    for (const key of Object.keys(form)) {
      if (form[key] === base.current.form[key]) continue;
      changes[key] = key === 'assignedTo' || key === 'dueDate' ? form[key] || null : form[key];
    }
    if (!Object.keys(changes).length) return;
    if (changes.title !== undefined && !changes.title.trim()) return setError('Title cannot be empty.');

    setSaving(true);
    setError('');
    try {
      const saved = await onSave(task.id, changes, base.current.version);
      base.current = { version: saved.version, form: toForm(saved) };
      setForm(base.current.form);
    } catch (err) {
      setError(err.status === 409 ? 'Someone else changed this task while you were editing.' : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title="Task details" onClose={onClose}>
      {stale && dirty && (
        <div className="notice-bar">
          Updated by someone else. <button className="link" onClick={loadLatest}>Load latest</button> (discards your edits)
        </div>
      )}

      <form className="stack" onSubmit={save}>
        <label>
          Title
          <input value={form.title} maxLength={200} onChange={set('title')} required />
        </label>
        <label>
          Description
          <textarea rows={4} value={form.description} maxLength={5000} onChange={set('description')} />
        </label>

        <div className="grid-2">
          <label>
            Status
            <select value={task.columnId} onChange={(e) => onMove(task.id, e.target.value)}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={set('priority')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label>
            Assignee
            <select value={form.assignedTo} onChange={set('assignedTo')}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn" disabled={saving || !dirty || (stale && dirty)}>{saving ? 'Saving…' : 'Save changes'}</button>
          {canDelete &&
            (confirmDelete ? (
              <button type="button" className="btn danger" onClick={() => onDelete(task.id)}>Confirm delete</button>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
            ))}
        </div>
      </form>

      <p className="meta muted">
        Created {new Date(task.createdAt).toLocaleString()} · Updated {new Date(task.updatedAt).toLocaleString()}
      </p>

      <h3>History</h3>
      <ActivityList items={history} empty="No history yet." />
    </Drawer>
  );
}
