"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addUserMessage,
  applyStep,
  type DemoState,
  initialState,
  matchPreset,
  presets,
  type Route,
  reset,
  resolvePending,
  type Step,
} from "../../lib/demo-logic";
import { CheckIcon, CloseIcon, MicIcon, WrenchIcon } from "../icons";

const URLS: Record<Route, string> = {
  home: "northwind.shop",
  pricing: "northwind.shop/pricing",
  orders: "northwind.shop/orders",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function Demo() {
  const [state, setState] = useState<DemoState>(initialState);
  const [typing, setTyping] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState("");
  const alive = useRef(true);
  const run = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: these values are the triggers for scrolling the log
  useEffect(() => {
    const log = logRef.current;
    if (log)
      log.scrollTo({ top: log.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [state.messages.length, typing, state.pending]);

  const play = useCallback(async (initial: DemoState, steps: Step[], token: number) => {
    let current = initial;
    const fast = prefersReducedMotion();
    for (const step of steps) {
      if (!alive.current || run.current !== token) return;
      if (step.type === "tool") {
        current = applyStep(current, step);
        setState(current);
        if (!fast) await wait(750);
      } else if (step.type === "say") {
        if (fast) {
          current = applyStep(current, step);
          setState(current);
        } else {
          for (let i = 1; i <= step.text.length; i += 2) {
            if (!alive.current || run.current !== token) return;
            setTyping(step.text.slice(0, i));
            await wait(18);
          }
          setTyping(null);
          current = applyStep(current, step);
          setState(current);
          await wait(250);
        }
      } else if (step.type === "navigate") {
        current = applyStep(current, step);
        setState(current);
        if (!fast) await wait(500);
      } else {
        current = applyStep(current, step);
        setState(current);
      }
    }
    setBusy(false);
  }, []);

  const send = useCallback(
    (text: string) => {
      if (busy || state.pending) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const token = ++run.current;
      setBusy(true);
      setDraft("");
      const next = addUserMessage(state, trimmed);
      setState(next);
      void play(next, matchPreset(trimmed).steps, token);
    },
    [busy, play, state],
  );

  const decide = useCallback(
    (approved: boolean) => {
      const token = ++run.current;
      const { state: next, steps } = resolvePending(state, approved);
      const label = approved ? "Approve" : "Reject";
      const withReply = addUserMessage(next, label);
      setState(withReply);
      setBusy(true);
      void play(withReply, steps, token);
    },
    [play, state],
  );

  const startVoice = useCallback(
    async (prompt: string) => {
      if (busy || state.pending) return;
      setListening(true);
      if (!prefersReducedMotion()) {
        for (let i = 1; i <= prompt.length; i += 2) {
          setDraft(prompt.slice(0, i));
          await wait(34);
          if (!alive.current) return;
        }
        await wait(250);
      }
      setListening(false);
      send(prompt);
    },
    [busy, send, state.pending],
  );

  const restart = () => {
    run.current++;
    setTyping(null);
    setBusy(false);
    setListening(false);
    setDraft("");
    setState(reset());
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <MiniSite route={state.route} order={state.order} />

      <div className="card flex h-[34rem] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">Helper</p>
            <p className="text-xs text-muted">Simulated demo. No model, no network.</p>
          </div>
          <button
            type="button"
            onClick={restart}
            className="ml-auto rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-line-strong hover:text-fg"
          >
            Restart
          </button>
        </div>

        <div
          ref={logRef}
          className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4"
          aria-live="polite"
        >
          {state.messages.length === 0 && !typing && (
            <p className="rounded-xl bg-surface p-3 text-sm leading-relaxed text-muted">
              Hi! I can open pages, look things up, and ask before I change anything. Pick a
              suggestion, or press the microphone.
            </p>
          )}
          {state.messages.map((m) => (
            <div key={m.id} className={`pop flex ${m.role === "user" ? "justify-end" : ""}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-accent text-white" : "bg-surface text-fg"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          {state.tools.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.tools.map((t) => (
                <span
                  key={t}
                  className="pop inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-xs text-muted"
                >
                  <WrenchIcon width={13} height={13} /> {t}
                  <CheckIcon width={13} height={13} className="text-ok" />
                </span>
              ))}
            </div>
          )}
          {typing !== null && (
            <div className="flex">
              <p className="max-w-[85%] rounded-2xl bg-surface px-3.5 py-2 text-sm leading-relaxed text-fg">
                {typing}
                <span className="caret" aria-hidden="true" />
              </p>
            </div>
          )}
          {state.pending && (
            <div
              role="alertdialog"
              aria-label="Approval needed"
              className="pop rounded-2xl border border-accent/50 bg-accent-soft p-4"
            >
              <p className="text-xs font-semibold tracking-wider text-accent uppercase">
                Needs your approval
              </p>
              <p className="mt-1 text-sm font-medium text-fg">{state.pending.summary}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white"
                >
                  <CheckIcon width={16} height={16} /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(false)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-medium text-fg hover:bg-surface"
                >
                  <CloseIcon width={16} height={16} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line p-3">
          <div className="mb-2.5 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy || !!state.pending}
                onClick={() => send(p.prompt)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-soft transition hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {p.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="demo-input" className="sr-only">
              Message the demo assistant
            </label>
            <input
              id="demo-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy || !!state.pending}
              placeholder={listening ? "Listening…" : "Type a message"}
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none placeholder:text-muted focus:border-accent disabled:opacity-60"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={busy || !!state.pending}
              onClick={() => void startVoice(presets[0]?.prompt ?? "")}
              aria-label="Try voice input (simulated)"
              aria-pressed={listening}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-soft transition hover:border-accent hover:text-fg disabled:opacity-40"
            >
              {listening ? (
                <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
                  {["a", "b", "c", "d"].map((id, i) => (
                    <span
                      key={id}
                      className="wave-bar h-4 w-0.5 rounded bg-accent"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </span>
              ) : (
                <MicIcon width={18} height={18} />
              )}
            </button>
            <button
              type="submit"
              disabled={busy || !!state.pending || !draft.trim()}
              className="btn btn-primary !min-h-11 !px-4 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MiniSite({ route, order }: { route: Route; order: "shipped" | "cancelled" }) {
  return (
    <div className="card flex h-[34rem] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="min-w-0 flex-1 truncate rounded-full border border-line bg-bg px-3 py-1 text-center font-mono text-xs text-muted">
          {URLS[route]}
        </div>
      </div>
      <div className="flex gap-1 border-b border-line px-4 py-2 text-xs" aria-hidden="true">
        {(["home", "pricing", "orders"] as Route[]).map((r) => (
          <span
            key={r}
            className={`rounded-full px-3 py-1 capitalize ${route === r ? "bg-accent-soft font-medium text-fg" : "text-muted"}`}
          >
            {r}
          </span>
        ))}
      </div>
      <section
        key={route}
        className="pop flex-1 overflow-y-auto p-5 sm:p-6"
        aria-label="Demo website preview"
      >
        {route === "home" && (
          <div>
            <p className="text-xs font-semibold tracking-wider text-accent uppercase">Northwind</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-fg">
              Good things, delivered.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A pretend shop. Ask the assistant to open a page, or to find your order.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {["Kettle", "Lamp", "Mug"].map((item, i) => (
                <div key={item} className="rounded-xl border border-line bg-surface p-3">
                  <div
                    className="mb-3 aspect-square rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, hsl(${250 + i * 40} 80% 65% / .55), hsl(${190 + i * 30} 80% 55% / .35))`,
                    }}
                  />
                  <p className="text-sm font-medium text-fg">{item}</p>
                  <p className="text-xs text-muted">from $24</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {route === "pricing" && (
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-fg">Pricing</h3>
            <p className="mt-1 text-sm text-muted">Simple plans. Cancel any time.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["Free", "$0", "For trying it out"],
                ["Pro", "$12", "For small teams"],
                ["Team", "$39", "For everyone else"],
              ].map(([name, price, text]) => (
                <div
                  key={name}
                  className={`rounded-xl border p-4 ${name === "Pro" ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
                >
                  <p className="text-sm font-semibold text-fg">{name}</p>
                  <p className="mt-1 text-2xl font-bold text-fg">
                    {price}
                    <span className="text-xs font-normal text-muted"> /mo</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {route === "orders" && (
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-fg">Your orders</h3>
            <div className="mt-5 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">Order #1042</p>
                  <p className="text-xs text-muted">2 items · $48.00</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    order === "cancelled"
                      ? "bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-danger"
                      : "bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok"
                  }`}
                >
                  {order === "cancelled" ? "Cancelled" : "Shipped"}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">
                {order === "cancelled"
                  ? "This order was cancelled."
                  : "On its way. Arrives Friday."}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
