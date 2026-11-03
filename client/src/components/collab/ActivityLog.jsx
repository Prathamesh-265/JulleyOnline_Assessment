import { ago } from '../../utils/format';
import Avatar from '../ui/Avatar';
import Drawer from '../ui/Drawer';

function describe(log) {
  const d = log.details ?? {};
  const title = d.title ? `“${d.title}”` : '';
  switch (`${log.entityType}:${log.action}`) {
    case 'task:created': return `created ${title}${d.column ? ` in ${d.column}` : ''}`;
    case 'task:moved': return `moved ${title} from ${d.from} to ${d.to}`;
    case 'task:reordered': return `reordered ${title} in ${d.to}`;
    case 'task:updated': return `edited ${title} (${Object.keys(d.changed ?? {}).join(', ') || 'no changes'})`;
    case 'task:deleted': return `deleted ${title}`;
    default: return `${log.action} ${log.entityType}${d.name ? ` “${d.name}”` : ''}`;
  }
}

export function ActivityList({ items, empty = 'Nothing yet.' }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="activity">
      {items.map((log) => (
        <li key={log.id}>
          <Avatar user={log.user} size={24} />
          <div>
            <p>
              <strong>{log.user.name}</strong> {describe(log)}
            </p>
            <time>{ago(log.createdAt)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ActivityLog({ items, onClose }) {
  return (
    <Drawer title="Activity" onClose={onClose}>
      <ActivityList items={items} empty="No activity in this branch yet." />
    </Drawer>
  );
}
