import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// One page for both /login and /register.
export default function Auth({ mode }) {
  const { user, loading, authenticate } = useAuth();
  const isRegister = mode === "register";
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".auth-brand > *", {
        y: 30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.7,
        ease: "power3.out",
      });
      gsap.from(".auth-card", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        delay: 0.1,
        ease: "power3.out",
      });
    }, root);
    return () => ctx.revert();
  }, [mode]);

  if (!loading && user) return <Navigate to="/app" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (isRegister && form.password !== form.confirm)
      return setError("Passwords do not match.");
    setBusy(true);
    try {
      await authenticate(
        mode,
        isRegister
          ? { name: form.name, email: form.email, password: form.password }
          : { email: form.email, password: form.password },
      );
    } catch (err) {
      setError(
        err.details?.[0]
          ? `${err.details[0].path}: ${err.details[0].message}`
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth" ref={root}>
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <aside className="auth-brand">
        <Link to="/" className="logo">
          {" "}
          Syncboard
        </Link>
        <h1>Boards that stay in sync, branch by branch.</h1>
        <p>
          Every branch gets its own private workspace. Everyone in it sees
          changes the moment they happen.
        </p>
      </aside>

      <form className="auth-card glass stack" onSubmit={submit}>
        <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
        {isRegister && (
          <label>
            Full name
            <input
              value={form.name}
              onChange={set("name")}
              required
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            required
            minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </label>
        {isRegister && (
          <label>
            Confirm password
            <input
              type="password"
              value={form.confirm}
              onChange={set("confirm")}
              required
              autoComplete="new-password"
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
        </button>
        <p className="muted small-print">
          {isRegister ? "Already have an account?" : "New here?"}{" "}
          <Link to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Log in" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
