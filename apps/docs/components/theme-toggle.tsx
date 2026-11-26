"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

function MonitorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

type Mode = "system" | "light" | "dark";
const KEY = "speeq-theme";

function resolve(mode: Mode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function apply(mode: Mode) {
  document.documentElement.dataset.theme = resolve(mode);
}
function read(): Mode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // storage may be blocked
  }
  return "dark";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    setMode(read());
    setReady(true);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (read() === "system") apply("system");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const choose = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage may be blocked; the choice still applies for this visit
    }
    apply(next);
  };
  const cycle = () => choose(mode === "dark" ? "light" : mode === "light" ? "system" : "dark");
  const label = mode === "system" ? "System theme" : mode === "dark" ? "Dark theme" : "Light theme";

  return (
    <button
      type="button"
      onClick={cycle}
      className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line text-soft transition hover:border-line-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`${label}. Press to change.`}
      title={label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={ready ? mode : "dark"}
          initial={reduce ? false : { opacity: 0, rotate: -70, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, rotate: 70, scale: 0.6 }}
          transition={{ duration: 0.18 }}
          className="flex"
        >
          {ready && mode === "light" ? (
            <SunIcon />
          ) : ready && mode === "system" ? (
            <MonitorIcon />
          ) : (
            <MoonIcon />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Runs before paint so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var m=localStorage.getItem("${KEY}")||"dark";var d=m==="system"?matchMedia("(prefers-color-scheme: dark)").matches:m==="dark";document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="dark"}document.documentElement.classList.remove("no-js")})()`;
