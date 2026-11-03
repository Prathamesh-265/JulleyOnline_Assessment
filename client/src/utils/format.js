export function ago(date) {
  const secs = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dueInfo(dueDate, done = false) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return {
    text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    overdue: !done && d.getTime() < Date.now() - 86_400_000,
  };
}
