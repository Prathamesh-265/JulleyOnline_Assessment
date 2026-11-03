// Round initials badge. The colour comes from the id so a person always looks the same.
export default function Avatar({ user, size = 26 }) {
  if (!user) return null;
  const hue = [...user.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="avatar" title={user.name} style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 65% 42%)` }}>
      {initials}
    </span>
  );
}
