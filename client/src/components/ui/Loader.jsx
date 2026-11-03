// Full-page / in-page loader: a tiny board where one card keeps hopping between columns,
// a shimmering wordmark and an indeterminate progress bar. Pure CSS, so it never blocks rendering.
export default function Loader({ label = 'Loading your workspace', full = false }) {
  return (
    <div className={`loader ${full ? 'full' : ''}`} role="status" aria-live="polite">
      <div className="loader-board" aria-hidden="true">
        {[0, 1, 2].map((col) => (
          <span className="lb-col" key={col}>
            <i className="lb-card" />
            {col !== 2 && <i className="lb-card short" />}
            {col === 0 && <i className="lb-card hop" />}
          </span>
        ))}
      </div>
      <p className="loader-brand">Syncboard</p>
      <div className="loader-bar" aria-hidden="true" />
      <p className="loader-label">
        {label}
        <span className="dots" aria-hidden="true"><b>.</b><b>.</b><b>.</b></span>
      </p>
    </div>
  );
}

// Greyed-out board shape shown while a board's data is on its way.
export function BoardSkeleton() {
  const columns = [[96, 72, 84], [84, 96], [72, 84, 96], [96]];
  return (
    <div className="skel-wrap" role="status" aria-label="Loading board">
      <div className="skel skel-title" />
      <div className="board-scroll">
        {columns.map((cards, i) => (
          <div className="column skel-col" key={i}>
            <div className="skel skel-head" />
            {cards.map((h, j) => (
              <div className="skel skel-card" style={{ height: h }} key={j} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}