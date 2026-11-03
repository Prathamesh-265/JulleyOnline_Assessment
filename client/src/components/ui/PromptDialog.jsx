import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

// Small modal with one text field (rename things). onSubmit may throw: the message shows in the dialog.
export default function PromptDialog({
  title,
  label,
  initial = "",
  confirmLabel = "Save",
  onSubmit,
  onCancel,
}) {
  const box = useRef(null);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    gsap.fromTo(
      box.current,
      { y: 16, scale: 0.97, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.25, ease: "power3.out" },
    );
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(text);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-wrap">
      <div className="modal-scrim" onClick={onCancel} />
      <form
        className="modal glass form-modal"
        ref={box}
        role="dialog"
        aria-label={title}
        onSubmit={submit}
      >
        <h2>{title}</h2>
        <label>
          {label}
          <input
            autoFocus
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn" disabled={busy || !value.trim()}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
