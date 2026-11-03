import Avatar from '../ui/Avatar';

export default function PresenceIndicator({ users }) {
  if (!users.length) return null;
  const shown = users.slice(0, 4);
  return (
    <div className="presence" title={users.map((u) => u.name).join(', ')}>
      <span className="presence-dot" />
      <div className="presence-stack">
        {shown.map((u) => (
          <Avatar key={u.id} user={u} size={26} />
        ))}
        {users.length > shown.length && <span className="avatar more">+{users.length - shown.length}</span>}
      </div>
      <span className="presence-label">{users.length} online</span>
    </div>
  );
}
