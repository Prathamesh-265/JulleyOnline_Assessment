import gsap from 'gsap';
import { useEffect, useRef } from 'react';

// Slide-in side panel. Full-screen on phones (see app.css).
export default function Drawer({ title, onClose, children }) {
  const panel = useRef(null);

  useEffect(() => {
    gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: 0.4, ease: 'power3.out' });
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="drawer-wrap">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" ref={panel} role="dialog" aria-label={title} data-lenis-prevent>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
