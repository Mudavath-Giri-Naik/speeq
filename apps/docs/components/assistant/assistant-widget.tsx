"use client";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSpeeq } from "speeq/react";
import { INTRO, LISTENING_AGAIN, SUGGESTIONS } from "../../lib/assistant/intro";
import { CloseIcon, Logo, MicIcon } from "../icons";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Searching the docs",
  navigate: "Opening the page",
  get_adoption_stats: "Checking live numbers",
};

function PhoneIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={off ? "rotate-[135deg]" : undefined}
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

/** Animated bars that show what the call is doing. */
function Wave({ mode }: { mode: "listening" | "thinking" | "speaking" | "paused" }) {
  const heights = mode === "speaking" ? 26 : mode === "listening" ? 14 : 8;
  return (
    <span className="flex h-7 items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${mode === "paused" ? "bg-warn" : "bg-accent"} ${
            mode === "paused" ? "" : "wave-bar"
          }`}
          style={{
            height: `${heights * (0.55 + ((i * 37) % 45) / 100)}px`,
            animationDelay: `${i * 0.09}s`,
            animationDuration: mode === "speaking" ? "0.7s" : mode === "thinking" ? "1.4s" : "1.1s",
            opacity: mode === "thinking" ? 0.55 : 1,
          }}
        />
      ))}
    </span>
  );
}

export function AssistantWidget() {
  const {
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
  const field = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  const busy = state === "thinking" || state === "speaking";

  // Keep the newest words in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these values are the triggers for scrolling
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, interimTranscript, activeTools.length, open]);

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
    // The call starts by telling the visitor what they can do.
    const line = introduced.current ? LISTENING_AGAIN : INTRO;
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

  const status = call.active
    ? call.interrupted
      ? "Paused. I'm listening."
      : state === "speaking"
        ? "Speaking. Talk any time to interrupt."
        : state === "thinking"
          ? "Thinking…"
          : interimTranscript
            ? "Hearing you…"
            : "Listening"
    : state === "thinking"
      ? "Thinking…"
      : "Ask me anything";

  const waveMode: "listening" | "thinking" | "speaking" | "paused" = call.interrupted
    ? "paused"
    : state === "speaking"
      ? "speaking"
      : state === "thinking"
        ? "thinking"
        : "listening";

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[80] flex flex-col items-end gap-3 sm:right-5 sm:bottom-5">
      {open && (
        <section
          role="dialog"
          aria-label="Speeq guide assistant"
          className="pop pointer-events-auto flex h-[min(34rem,calc(100dvh-6.5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-line-strong bg-elev shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] sm:w-[24rem]"
        >
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="relative">
              <Logo size={34} />
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-elev ${
                  call.active ? (call.interrupted ? "bg-warn" : "bg-ok") : "bg-muted"
                }`}
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">Speeq Guide</p>
              <p className="truncate text-xs text-muted" role="status">
                {status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
              aria-label="Minimize assistant"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </header>

          {/* Conversation */}
          <div
            ref={log}
            className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4"
            aria-live="polite"
          >
            <div className="rounded-2xl bg-surface p-3.5 text-sm leading-relaxed text-soft">
              <p className="font-medium text-fg">Hi! Here is what I can do.</p>
              <ul className="mt-2 space-y-1 text-[0.82rem] text-muted">
                <li>• Open any page on this site</li>
                <li>• Explain any part of the docs</li>
                <li>• Read live install and GitHub numbers</li>
                <li>• Talk with you hands-free, and stop when you interrupt</li>
              </ul>
              {messages.length === 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => void sendText(text)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-soft transition hover:border-accent hover:text-fg"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <p
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-accent text-white" : "bg-surface text-fg"
                  } ${m.status === "interrupted" ? "opacity-70" : ""}`}
                >
                  {m.text}
                  {m.status === "streaming" && <span className="caret" aria-hidden="true" />}
                  {m.status === "interrupted" && (
                    <span className="ml-1 text-xs opacity-70">(interrupted)</span>
                  )}
                </p>
              </div>
            ))}

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
                <p className="max-w-[88%] rounded-2xl border border-dashed border-accent/60 bg-accent-soft px-3.5 py-2 text-sm leading-relaxed text-fg">
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

          {/* Controls */}
          <footer className="border-t border-line p-3">
            {call.active ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5">
                <Wave mode={waveMode} />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {call.interrupted ? "Paused for a moment…" : "On a call. Just talk."}
                </span>
                {busy && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-full border border-line px-3 py-1 text-xs text-soft hover:border-line-strong hover:text-fg"
                  >
                    Stop
                  </button>
                )}
              </div>
            ) : null}

            <form onSubmit={submit} className="flex items-center gap-2">
              <label htmlFor="speeq-guide-input" className="sr-only">
                Type a message to the assistant
              </label>
              <input
                id="speeq-guide-input"
                ref={field}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={call.active ? "Or type here…" : "Type a message"}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
              />
              {call.active ? (
                <button
                  type="button"
                  onClick={endCall}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-white transition hover:brightness-110"
                  aria-label="End call"
                >
                  <PhoneIcon off /> End
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="btn btn-ghost !min-h-11 !px-4 disabled:opacity-40"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={begin}
                    disabled={!support.speechInput}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-ok px-4 text-sm font-semibold text-[#04130c] transition hover:brightness-110 disabled:opacity-40"
                    aria-label="Start a voice call"
                  >
                    <PhoneIcon /> Call
                  </button>
                </>
              )}
            </form>
            {!support.speechInput && (
              <p className="mt-2 text-xs text-muted">
                Voice needs Chrome, Edge or Safari. You can still type.
              </p>
            )}
          </footer>
        </section>
      )}

      {/* Launcher */}
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? setOpen(false) : setOpen(true))}
        aria-label={
          open
            ? "Minimize assistant"
            : call.active
              ? "Open assistant, call in progress"
              : "Open assistant"
        }
        aria-expanded={open}
        className="group pointer-events-auto relative inline-flex h-14 items-center gap-2.5 rounded-full border border-line-strong bg-elev pr-5 pl-4 text-sm font-semibold text-fg shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] transition hover:border-accent"
      >
        {call.active && (
          <span
            className="absolute inset-0 -z-10 rounded-full bg-ok/25 motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}
        {call.active ? (
          <Wave mode={waveMode} />
        ) : (
          <MicIcon width={22} height={22} className="text-accent" />
        )}
        <span className="hidden sm:inline">
          {call.active ? (call.interrupted ? "Paused" : "On call") : "Ask speeq"}
        </span>
      </button>
    </div>
  );
}
