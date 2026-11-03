import gsap from 'gsap';
import { useEffect, useRef } from 'react';

export default function Toast({ message, onDone }) {
  const el = useRef(null);

  useEffect(() => {
    if (!message) return;
    gsap.fromTo(el.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
    const timer = setTimeout(onDone, 4500);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div className="toast" ref={el} role="status" onClick={onDone}>
      {message}
    </div>
  );
}
