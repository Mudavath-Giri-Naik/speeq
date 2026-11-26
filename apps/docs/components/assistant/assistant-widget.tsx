"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSpeeq } from "speeq/react";
import { CALL_GREETING, LISTENING_AGAIN, SUGGESTIONS } from "../../lib/assistant/intro";
import { MicIcon } from "../icons";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Searching the docs",
  navigate: "Opening the page",
  get_adoption_stats: "Checking live numbers",
};

const CAPABILITIES = ["Open any page", "Explain the docs", "Live numbers", "Hands-free calls"];

type Mode = "idle" | "listening" | "hearing" | "thinking" | "speaking" | "paused";

function PhoneIcon({ off = false, size = 18 }: { off?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
      {off && <path d="m3 3 18 18" />}
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

/**
 * The glowing orb. It swells with the visitor's voice and breathes while the guide talks. The
 * loudness is written straight to a CSS variable every frame, so nothing re-renders.
 */
function Orb({
  mode,
  size,
  getLevel,
  onPress,
  label,
}: {
  mode: Mode;
  size: number;
  getLevel: () => number;
  onPress?: () => void;
  label: string;
}) {
  const ref = useRef<HTMLSpanElement | HTMLButtonElement>(null) as React.RefObject<HTMLSpanElement>;
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let frame = 0;
    let shown = 0;
    const loop = () => {
      const target = Math.min(1, getLevel());
      shown += (target - shown) * 0.35;
      el.style.setProperty("--lvl", shown.toFixed(3));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, reduce]);

  const style = { ["--orb" as string]: `${size}px` };
  const inner = (
    <>
      <span className="orb-halo" aria-hidden="true" />
      <span className="orb-body" aria-hidden="true">
        <span className="orb-blob orb-blob-a" />
        <span className="orb-blob orb-blob-b" />
        <span className="orb-blob orb-blob-c" />
        <span className="orb-shine" />
      </span>
    </>
  );
  // A real button only when it can be pressed, so the launcher can hold a plain orb.
  return onPress ? (
    <button
      ref={ref as unknown as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onPress}
      aria-label={label}
      data-mode={mode}
      className="orb cursor-pointer"
      style={style}
    >
      {inner}
    </button>
  ) : (
    <span ref={ref} data-mode={mode} className="orb" style={style}>
      {inner}
    </span>
  );
}

export function AssistantWidget() {
  const {
    client,
    state,
    messages,
    interimTranscript,
    call,
    error,
    activeTools,
    support,
    sendText,
    startCall,
    endCall,
    cancel,
    speak,
  } = useSpeeq();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const introduced = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  const getLevel = useCallback(() => client.getMicLevel(), [client]);

  // Keep the newest words in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these values are the triggers for scrolling
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, interimTranscript, activeTools.length, open]);

  // Buttons elsewhere on the site can open the panel.
  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener("speeq:open-assistant", openPanel);
    return () => window.removeEventListener("speeq:open-assistant", openPanel);
  }, []);

  // Escape closes the panel, but never ends a call.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const begin = useCallback(() => {
    setOpen(true);
    startCall();
    // The call starts by telling the visitor what they can do. It is short, and the visitor can
    // talk over it at any time.
    const line = introduced.current ? LISTENING_AGAIN : CALL_GREETING;
    introduced.current = true;
    void speak(line);
  }, [speak, startCall]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void sendText(text);
  };

  const mode: Mode = call.interrupted
    ? "paused"
    : state === "speaking"
      ? "speaking"
      : state === "thinking"
        ? "thinking"
        : call.active
          ? interimTranscript
            ? "hearing"
            : "listening"
          : "idle";

  const status =
    mode === "paused"
      ? "Paused. I'm listening"
      : mode === "speaking"
        ? "Speaking. Tap me or talk to interrupt"
        : mode === "thinking"
          ? "Thinking…"
          : mode === "hearing"
            ? "Hearing you…"
            : mode === "listening"
              ? "Listening. Just talk"
              : "Speak or type a message";

  const empty = messages.length === 0 && !interimTranscript;
  const busy = state === "thinking" || state === "speaking";

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[80] flex flex-col items-end gap-3 sm:right-5 sm:bottom-5">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Speeq guide assistant"
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.94, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.96, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
            style={{ transformOrigin: "bottom right" }}
            className="assistant-panel pointer-events-auto flex h-[min(37rem,calc(100dvh-6.5rem))] w-[min(24.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-line-strong bg-elev shadow-[0_40px_90px_-24px_rgba(0,0,0,0.6)]"
          >
            {/* Header */}
            <header className="flex items-center gap-2 px-5 pt-4 pb-1">
              <h2 className="flex-1 truncate text-[0.95rem] font-semibold tracking-tight text-fg">
                Speeq guide
              </h2>
              <button
                type="button"
                onClick={call.active ? endCall : begin}
                disabled={!call.active && !support.speechInput}
                aria-label={call.active ? "End call" : "Start a voice call"}
                aria-pressed={call.active}
                title={call.active ? "End call" : "Start a voice call"}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition disabled:opacity-40 ${
                  call.active
                    ? "bg-danger/12 text-danger hover:bg-danger/20"
                    : "text-ok hover:bg-ok/12"
                }`}
              >
                <PhoneIcon off={call.active} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-fg"
                aria-label="Minimize assistant"
              >
                <ChevronIcon />
              </button>
            </header>

            {/* The orb */}
            <div className="flex flex-col items-center px-5 pt-1 pb-2">
              <motion.div
                animate={{
                  scale: empty ? 1 : 0.62,
                  marginBottom: empty ? 4 : -18,
                  marginTop: empty ? 6 : -10,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              >
                <Orb
                  mode={mode}
                  size={118}
                  getLevel={getLevel}
                  onPress={busy ? cancel : undefined}
                  label={busy ? "Interrupt the guide" : "Voice status"}
                />
              </motion.div>
              <p className="text-[0.82rem] text-muted" role="status" aria-live="polite">
                {status}
              </p>
            </div>

            {/* Conversation */}
            <div
              ref={log}
              className="scroll-thin flex-1 space-y-2.5 overflow-y-auto px-4 pt-2 pb-3"
            >
              <AnimatePresence initial={false}>
                {empty && (
                  <motion.div
                    key="intro"
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pt-1"
                  >
                    <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-fg">
                      Hi, what would you like to explore about speeq?
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CAPABILITIES.map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-line px-2.5 py-1 text-[0.72rem] text-muted"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {SUGGESTIONS.map((text, i) => (
                        <motion.button
                          key={text}
                          type="button"
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.12 + i * 0.06 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => void sendText(text)}
                          className="rounded-full border border-line bg-bg px-3 py-1.5 text-xs text-soft transition hover:border-accent hover:text-fg"
                        >
                          {text}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    layout="position"
                    initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className={`flex ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    <p
                      className={`max-w-[88%] px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-accent text-white rounded-2xl rounded-br-md"
                          : "bg-surface text-fg rounded-2xl rounded-bl-md"
                      } ${m.status === "interrupted" ? "opacity-70" : ""}`}
                    >
                      {m.text}
                      {m.status === "streaming" && <span className="caret" aria-hidden="true" />}
                      {m.status === "interrupted" && (
                        <span className="ml-1 text-xs opacity-70">(interrupted)</span>
                      )}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>

              {activeTools.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeTools.map((tool) => (
                    <span
                      key={tool.callId}
                      className="pop inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted"
                    >
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {TOOL_LABELS[tool.name] ?? tool.name}…
                    </span>
                  ))}
                </div>
              )}

              {interimTranscript && (
                <div className="flex justify-end">
                  <p className="max-w-[88%] rounded-2xl rounded-br-md border border-dashed border-accent/60 bg-accent-soft px-3.5 py-2.5 text-sm leading-relaxed text-fg">
                    {interimTranscript}
                    <span className="caret" aria-hidden="true" />
                  </p>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  {error.message}
                </p>
              )}
            </div>

            {/* Input */}
            <footer className="p-3 pt-1">
              <form onSubmit={submit} className="flex items-center gap-2">
                <label htmlFor="speeq-guide-input" className="sr-only">
                  Type a message to the assistant
                </label>
                <input
                  id="speeq-guide-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={call.active ? "Or type here…" : "Type a message"}
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-35"
                >
                  Send <SendIcon />
                </button>
              </form>
              {!support.speechInput && (
                <p className="mt-2 px-1 text-xs text-muted">
                  Voice needs Chrome, Edge or Safari. You can still type.
                </p>
              )}
            </footer>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Launcher */}
      <motion.button
        ref={launcher}
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.95 }}
        aria-label={
          open
            ? "Minimize assistant"
            : call.active
              ? "Open assistant, call in progress"
              : "Open assistant"
        }
        aria-expanded={open}
        className="group pointer-events-auto relative inline-flex h-14 items-center gap-2.5 rounded-full border border-line-strong bg-elev pr-5 pl-3 text-sm font-semibold text-fg shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] transition-colors hover:border-accent"
      >
        {call.active && (
          <span
            className="absolute inset-0 -z-10 rounded-full bg-accent/25 motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}
        {call.active ? (
          <span className="launcher-orb" aria-hidden="true">
            <Orb mode={mode} size={34} getLevel={getLevel} label="Call in progress" />
          </span>
        ) : (
          <span className="launcher-orb" aria-hidden="true">
            <MicIcon width={20} height={20} className="text-white" />
          </span>
        )}
        <span className="hidden sm:inline">
          {call.active ? (call.interrupted ? "Paused" : "On call") : "Ask speeq"}
        </span>
      </motion.button>
    </div>
  );
}
