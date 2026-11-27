import type { DecisionsFile, Manifest } from "@speeq/core/manifest";
import type { IntegrationPlan, PlanOptions, ProjectFs } from "@speeq/integrate";

/** Exit codes shared by every command. */
export const EXIT = { ok: 0, failure: 1, usage: 2, needsReview: 3, unsupported: 4 } as const;

/** Questions the CLI may ask. Implemented with clack in the binary and scripted in tests. */
export interface Prompter {
  confirm(message: string, initial?: boolean): Promise<boolean>;
  select<T extends string>(
    message: string,
    options: { value: T; label: string; hint?: string }[],
  ): Promise<T>;
  multiselect<T extends string>(
    message: string,
    options: { value: T; label: string; hint?: string }[],
    initial?: T[],
  ): Promise<T[]>;
  text(message: string, initial?: string): Promise<string>;
}
/** Everything outside the process the CLI needs. Injected so tests run without a terminal. */
export interface CliEnv {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  /** True when both stdin and stdout are terminals. */
  isTTY: boolean;
  prompts?: Prompter;
  /** Runs a package-manager command. Only called after an explicit approval. */
  exec?: (command: string, args: string[], cwd: string) => Promise<number>;
}
/** Parsed command line. */
export interface Flags {
  json: boolean;
  dryRun: boolean;
  diff: boolean;
  yes: boolean;
  ci: boolean;
  install: boolean;
  forwardAuth: boolean;
  noConfirm: boolean;
  runHost: boolean;
  help: boolean;
  version: boolean;
  cwd?: string;
  app?: string;
  provider?: string;
  kind?: string;
  status?: string;
  access?: string;
  auth?: string;
  roles?: string;
  name?: string;
}
/** A scanned project ready for planning. */
export interface Loaded {
  manifest: Manifest;
  fs: ProjectFs;
  prefix: string;
  decisions: DecisionsFile | undefined;
  options: PlanOptions;
  diagnostics: number;
}
/** Per-command context. */
export interface Ctx {
  command: string;
  args: string[];
  flags: Flags;
  env: CliEnv;
  interactive: boolean;
  /** Human text; ignored in JSON mode. */
  say(text: string): void;
  /** Print the JSON document (JSON mode only) and return the exit code. */
  finish(exit: number, doc?: Record<string, unknown>): number;
}
/** Unwinds a command with a message and an exit code. */
export class CliExit extends Error {
  constructor(
    readonly exit: number,
    message: string,
    readonly code: string,
    readonly doc: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
/** The JSON-friendly summary of a plan. */
export function planSummary(plan: IntegrationPlan) {
  return {
    changes: plan.changes.map((c) => ({
      path: c.path,
      action: c.action,
      ownership: c.ownership,
      conflict: c.conflict === true,
    })),
    wrapped: plan.wrapped,
    skipped: plan.skipped,
    stale: plan.stale,
    pending: plan.pending,
    manual: plan.manual.map((m) => m.title),
    dependencies: plan.dependencies,
    env: plan.env.map((e) => e.name),
    conflicts: plan.conflicts,
  };
}
