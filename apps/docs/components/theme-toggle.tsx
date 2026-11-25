"use client";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

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
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-soft transition hover:border-line-strong hover:text-fg"
      aria-label={`${label}. Press to change.`}
      title={label}
    >
      {ready && mode === "light" ? <SunIcon /> : <MoonIcon />}
      {ready && mode === "system" && (
        <span
          className="absolute -mt-6 ml-6 h-1.5 w-1.5 rounded-full bg-accent"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** Runs before paint so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var m=localStorage.getItem("${KEY}")||"dark";var d=m==="system"?matchMedia("(prefers-color-scheme: dark)").matches:m==="dark";document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="dark"}document.documentElement.classList.remove("no-js")})()`;
