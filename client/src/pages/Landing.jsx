import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    title: "Live by default",
    text: "Move a card and everyone on the board sees it land, no refresh.",
    tag: "Socket.IO",
    big: true,
  },
  {
    title: "Branch isolation",
    text: "Hyderabad never sees Bangalore. Enforced in the API, the sockets and the database.",
    tag: "Multi-tenant",
  },
  {
    title: "Three roles",
    text: "Org Admin, Tenant Admin and Member, checked on the server every time.",
    tag: "RBAC",
  },
  {
    title: "Edit conflicts, handled",
    text: "Two people, one task: the second save is stopped and shown the latest version.",
    tag: "Versioned",
    big: true,
  },
  {
    title: "Who is here",
    text: "Presence for every branch, across tabs.",
    tag: "Presence",
  },
  {
    title: "Full history",
    text: "Every change is logged per branch and per task.",
    tag: "Activity",
  },
  {
    title: "Works on your phone",
    text: "Swipe between columns, press and hold to drag.",
    tag: "Responsive",
  },
];

const STEPS = [
  ["Pick your branch", "Choose an organization, then the branch you work in."],
  [
    "Drag work forward",
    "Cards move instantly on your screen while the server confirms.",
  ],
  [
    "Everyone stays in sync",
    "Teammates in that branch see the change, nobody else does.",
  ],
];

const HEADLINE = "Move work forward, together.".split(" ");

export default function Landing() {
  const { user } = useAuth();
  const root = useRef(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // hero intro
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".hero-word", {
          yPercent: 120,
          opacity: 0,
          duration: 0.9,
          stagger: 0.08,
        })
        .from(
          ".hero-fade",
          { y: 24, opacity: 0, duration: 0.7, stagger: 0.1 },
          "-=0.5",
        )
        .from(
          ".mock",
          { y: 60, opacity: 0, rotateX: 12, duration: 1 },
          "-=0.7",
        );

      // ambient motion
      gsap.to(".blob-a", {
        x: 60,
        y: 40,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".blob-b", {
        x: -50,
        y: -30,
        duration: 10,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".mock-card.bob", {
        y: -6,
        duration: 2.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.4,
      });

      // the demo card hops from "To do" to "Doing" and back, forever
      const hop = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 2 });
      hop
        .to(".mock-card.hop", {
          x: () =>
            document.querySelector(".mock-col:nth-child(2)").offsetLeft -
            document.querySelector(".mock-col:nth-child(1)").offsetLeft,
          y: () =>
            document.querySelector(".mock-col:nth-child(2) .mock-card")
              .offsetHeight + 10,
          rotate: 4,
          scale: 1.04,
          duration: 1,
          ease: "power2.inOut",
        })
        .to(".mock-card.hop", { rotate: 0, scale: 1, duration: 0.3 })
        .to(
          ".mock-card.hop",
          { x: 0, y: 0, duration: 0.9, ease: "power2.inOut" },
          "+=1.6",
        );

      // scroll reveals
      gsap.set(".reveal", { y: 40, opacity: 0 });
      ScrollTrigger.batch(".reveal", {
        start: "top 88%",
        once: true,
        onEnter: (els) =>
          gsap.to(els, {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.1,
            ease: "power3.out",
          }),
      });
      gsap.to(".blob-a", {
        yPercent: -40,
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });
      gsap.from(".steps-line", {
        scaleX: 0,
        transformOrigin: "left",
        ease: "none",
        scrollTrigger: {
          trigger: ".steps",
          start: "top 70%",
          end: "bottom 60%",
          scrub: true,
        },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div className="landing" ref={root}>
      <div className="blob blob-a" />
      <div className="blob blob-b" />

      <header className="land-nav">
        <Link to="/" className="logo">
          {" "}
          Syncboard
        </Link>
        <nav>
          {user ? (
            <Link className="btn small" to="/app">
              Open app
            </Link>
          ) : (
            <>
              <Link className="btn ghost small" to="/login">
                Log in
              </Link>
              <Link className="btn small" to="/register">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow hero-fade">
          Real-time · Multi-tenant · Conflict-safe
        </p>
        <h1>
          {HEADLINE.map((w, i) => (
            <span className="word-mask" key={i}>
              <span className="hero-word">{w}</span>
            </span>
          ))}
        </h1>
        <p className="lead hero-fade">
          A Kanban board for teams spread across branches. Each branch gets a
          private workspace that updates live for everyone in it.
        </p>
        <div className="hero-cta hero-fade">
          <Link className="btn" to={user ? "/app" : "/register"}>
            {user ? "Open your boards" : "Start for free"}
          </Link>
          <a className="btn ghost" href="#features">
            See how it works
          </a>
        </div>

        <div className="mock glass" aria-hidden="true">
          <div className="mock-bar">
            <i />
            <i />
            <i />
            <span>Website Development · Hyderabad</span>
            <b className="mock-online">
              <em /> 3 online
            </b>
          </div>
          <div className="mock-cols">
            <div className="mock-col">
              <h5>To do</h5>
              <div className="mock-card hop">Create login page</div>
              <div className="mock-card bob">Fix API validation</div>
            </div>
            <div className="mock-col">
              <h5>Doing</h5>
              <div className="mock-card bob">Registration API</div>
            </div>
            <div className="mock-col">
              <h5>Done</h5>
              <div className="mock-card bob">Deploy dashboard</div>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <h2 className="reveal">Built for how branches really work</h2>
        <div className="bento">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className={`bento-card glass reveal ${f.big ? "big" : ""}`}
            >
              <span className="chip">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="steps">
        <h2 className="reveal">Three steps. No refresh.</h2>
        <div className="steps-track">
          <div className="steps-line" />
        </div>
        <ol>
          {STEPS.map(([title, text], i) => (
            <li key={title} className="reveal">
              <span className="step-num">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="cta glass reveal">
        <h2>Ready when your team is.</h2>
        <Link className="btn" to={user ? "/app" : "/register"}>
          {user ? "Open your boards" : "Create your account"}
        </Link>
      </section>

      <footer className="land-foot">
        Syncboard · built as a full-stack assessment project
      </footer>
    </div>
  );
}
