// Shown whenever the live connection is down. Updates resume automatically on reconnect.
export default function ConnectionBanner({ online, wasOnline }) {
  if (online) return null;
  return (
    <div className="conn-banner" role="status">
      <span className="pulse" />
      {wasOnline ? 'Connection lost. Reconnecting… your changes will sync when you are back.' : 'Connecting to live updates…'}
    </div>
  );
}
