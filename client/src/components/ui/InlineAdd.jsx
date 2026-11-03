import { useRef, useState } from 'react';

// A "+ Add something" button that turns into a one-line form. onSubmit must handle its own errors.
export default function InlineAdd({ label, placeholder = 'Name', onSubmit, className = '' }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // a ref, because state updates too late to stop a fast double click

  const submit = async (e) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await onSubmit(text);
      setValue('');
      setOpen(false);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={`add-btn ${className}`} onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }

  return (
    <form className={`inline-add ${className}`} onSubmit={submit}>
      <input
        autoFocus
        value={value}
        maxLength={200}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => !value && setOpen(false)}
      />
      <button className="btn small" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
    </form>
  );
}