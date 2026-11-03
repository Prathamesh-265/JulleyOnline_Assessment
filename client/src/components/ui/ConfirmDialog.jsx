import gsap from 'gsap';
import { useEffect, useRef } from 'react';

// Small centred confirmation modal. Escape or a click outside cancels.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', busy = false, onConfirm, onCancel }) {
  const box = useRef(null);

  useEffect(() => {
    gsap.fromTo(box.current, { y: 16, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.25, ease: 'power3.out' });
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  return (
    <div className="modal-wrap">
      <div className="modal-scrim" onClick={() => !busy && onCancel()} />
      <div className="modal glass" ref={box} role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <div className="modal-icon" aria-hidden="true">!</div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-text" className="muted">{message}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn danger" onClick={onConfirm} disabled={busy} autoFocus>{busy ? 'Deleting…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}