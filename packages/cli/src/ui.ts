import { intro, log, note, outro, progress, spinner } from "@clack/prompts";
import pc from "picocolors";
import type { Ctx } from "./types.js";

/** A spinner for work of unknown length. */
export interface Busy {
  update(message: string): void;
  stop(message: string, ok?: boolean): void;
}
/** A progress bar for work with a known number of steps. */
export interface Bar {
  advance(message: string): void;
  stop(message: string): void;
}
/**
 * How the setup screens look. The binary draws with clack (boxes, spinners, progress bars); tests and
 * non-terminal runs get plain lines, so output is still readable in a log.
 */
export interface Ui {
  intro(title: string): void;
  outro(message: string): void;
  /** A numbered section header such as `Step 2 of 4 · Voice`. */
  step(n: number, total: number, title: string): void;
  note(body: string, title?: string): void;
  ok(message: string): void;
  warn(message: string): void;
  fail(message: string): void;
  info(message: string): void;
  busy(message: string): Busy;
  bar(max: number, message: string): Bar;
}

/** The terminal UI used by the `speeq` executable. */
export const clackUi: Ui = {
  intro: (title) => intro(`${pc.bgCyan(pc.black(" speeq "))}  ${pc.bold(title)}`),
  outro: (message) => outro(message),
  step: (n, total, title) =>
    log.step(`${pc.cyan(`Step ${n} of ${total}`)} ${pc.dim("·")} ${pc.bold(title)}`),
  note: (body, title) => note(body, title),
  ok: (m) => log.success(m),
  warn: (m) => log.warn(m),
  fail: (m) => log.error(m),
  info: (m) => log.info(m),
  busy(message) {
    const s = spinner();
    s.start(message);
    return {
      update: (m) => s.message(m),
      stop: (m, ok = true) => (ok ? s.stop(m) : s.error(m)),
    };
  },
  bar(max, message) {
    const p = progress({ style: "heavy", max, size: 24 });
    p.start(message);
    return { advance: (m) => p.advance(1, m), stop: (m) => p.stop(m) };
  },
};

/** Plain lines for tests, CI logs and anything that is not a terminal. */
export function plainUi(say: (text: string) => void): Ui {
  return {
    intro: (t) => say(`speeq  ${t}`),
    outro: (m) => say(m),
    step: (n, total, t) => say(`\nStep ${n} of ${total}: ${t}`),
    note: (body, title) => say(`${title ? `${title}\n` : ""}${body}`),
    ok: (m) => say(`✓ ${m}`),
    warn: (m) => say(`! ${m}`),
    fail: (m) => say(`✗ ${m}`),
    info: (m) => say(m),
    busy: (m) => {
      say(`${m}...`);
      return { update: () => {}, stop: (message) => say(message) };
    },
    bar: (_max, m) => {
      say(`${m}...`);
      return { advance: () => {}, stop: (message) => say(message) };
    },
  };
}
/** The UI for a command: the injected one, or plain lines. */
export const uiOf = (ctx: Ctx): Ui => ctx.env.ui ?? plainUi(ctx.say);

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
/** Text without colour codes. */
export const plain = (text: string) => text.replace(ANSI, "");
/** Visible width of text that may contain colour codes. */
export const width = (text: string) => plain(text).length;
/** Pad to a visible width, ignoring colour codes. */
export const pad = (text: string, to: number) => text + " ".repeat(Math.max(0, to - width(text)));
/** A tiny bar showing how fast a model answered (shorter is faster). */
export function speedBar(ms: number, slowest = 3000): string {
  const filled = Math.max(1, Math.min(8, Math.round(8 - (Math.min(ms, slowest) / slowest) * 7)));
  return pc.green("▰".repeat(filled)) + pc.dim("▱".repeat(8 - filled));
}
