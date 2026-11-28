import {
  applyPlan,
  lineDiff,
  planSettingsSave,
  readSetup,
  recommend,
  restartHint,
  SECTIONS,
  type SectionId,
  type SectionStatus,
  sectionStatuses,
  setupText,
  verifyProject,
} from "@speeq/integrate";
import pc from "picocolors";
import type { Ctx } from "../types.js";
import { pad, uiOf } from "../ui.js";
import {
  agentSection,
  authSection,
  businessSection,
  chatSection,
  contextSection,
  greetingSection,
  memorySection,
  modelSection,
  pageSection,
  storageSection,
  voiceSection,
} from "./sections.js";
import { type ControlState, candidates, controlInput, normalized } from "./state.js";

const BADGE: Record<SectionStatus["badge"], string> = {
  set: pc.green("✓ set"),
  review: pc.yellow("! review"),
  off: pc.dim("○ off"),
  broken: pc.red("✕ broken"),
};
const PLAIN_BADGE: Record<SectionStatus["badge"], string> = {
  set: "✓",
  review: "!",
  off: "○",
  broken: "✕",
};

/** Accepts `05`, `5`, `auth` or a word of the title for `speeq setup <section>`. */
export function sectionFor(arg: string | undefined): SectionId | undefined {
  if (!arg) return undefined;
  const a = arg.toLowerCase();
  const n = Number(a);
  if (Number.isInteger(n) && n >= 1 && n <= SECTIONS.length) return SECTIONS[n - 1]?.id;
  const alias: Record<string, SectionId> = {
    identity: "auth",
    personality: "agent",
    llm: "model",
    languages: "voice",
    greetings: "greeting",
    starters: "greeting",
    mongodb: "storage",
    store: "storage",
    diagnostics: "verify",
    ui: "chat",
    page: "page",
  };
  return (SECTIONS.find((s) => s.id === a)?.id ?? alias[a]) as SectionId | undefined;
}

async function card(st: ControlState): Promise<string> {
  const input = await controlInput(st);
  const statuses = sectionStatuses(input);
  const rec = recommend(input, statuses);
  const project = st.loaded?.manifest.project;
  const head = [
    `${pc.dim(pad("Project", 13))}${st.name}${project?.appDir ? pc.dim(` (${project.appDir})`) : ""}`,
    `${pc.dim(pad("Framework", 13))}Next.js ${project?.framework === "nextjs-pages" ? "Pages Router" : "App Router"}`,
    `${pc.dim(pad("Model", 13))}${statuses.find((s) => s.id === "model")?.detail ?? ""}`,
    `${pc.dim(pad("Sign-in", 13))}${statuses.find((s) => s.id === "auth")?.detail ?? ""}`,
    `${pc.dim(pad("Memory", 13))}${statuses.find((s) => s.id === "memory")?.detail ?? ""}`,
    `${pc.dim(pad("Verified", 13))}${st.draft.verifiedAt ? st.draft.verifiedAt.slice(0, 16).replace("T", " ") : "not yet"}`,
  ];
  const rows = statuses.map(
    (s, i) =>
      `${pc.dim(String(i + 1).padStart(2, "0"))}  ${pad(s.title, 34)} ${pad(BADGE[s.badge], 10)} ${pc.dim(clip(s.detail, 30))}`,
  );
  const lines = [...head, "", ...rows];
  if (rec)
    lines.push(
      "",
      `${pc.bold(pc.cyan("Recommended"))}  ${rec.text}  ${pc.dim(`(about ${rec.minutes} minute${rec.minutes > 1 ? "s" : ""})`)}`,
    );
  if (dirty(st))
    lines.push("", pc.yellow("● Unsaved changes. Choose Save to review and write them."));
  return lines.join("\n");
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** True when the draft or the wizard choices differ from what is on disk. */
export function dirty(st: ControlState): boolean {
  const saved = st.saved;
  const now = {
    ...saved,
    ...normalized(st.draft),
    provider: st.c.provider,
    voice: st.c.voice,
    languages: st.c.languages,
    ui: st.c.ui,
  };
  return (
    setupText(now) !== setupText(saved) ||
    st.name !== (saved.name ?? "Assistant") ||
    Object.keys(st.c.values).length > 0
  );
}

const RUNNERS: Record<Exclude<SectionId, "verify">, (st: ControlState) => Promise<void>> = {
  agent: agentSection,
  business: businessSection,
  model: modelSection,
  voice: voiceSection,
  auth: authSection,
  context: contextSection,
  page: pageSection,
  greeting: greetingSection,
  memory: memorySection,
  storage: storageSection,
  chat: chatSection,
};

/** Runs the static and runtime checks (mock model only) and records a pass in the draft. */
export async function runChecks(st: ControlState): Promise<boolean> {
  const ui = uiOf(st.ctx);
  if (!st.loaded) return false;
  const busy = ui.busy("Running checks (static files and a mock-model smoke test)");
  const started = Date.now();
  const r = await verifyProject({
    fs: st.loaded.fs,
    manifest: st.loaded.manifest,
    options: st.loaded.options,
    levels: ["static", "runtime"],
    env: st.ctx.env.env,
  });
  const fails = r.checks.filter((c) => c.status === "fail");
  const warns = r.checks.filter((c) => c.status === "warn");
  busy.stop(
    r.ok
      ? `Checks passed ${pc.dim(`· ${r.checks.length} checks · ${Date.now() - started} ms`)}`
      : `${fails.length} check(s) failed`,
    r.ok,
  );
  const lines = [...fails, ...warns]
    .slice(0, 8)
    .map(
      (c) =>
        `${c.status === "fail" ? pc.red("✕") : pc.yellow("!")} ${c.title}${c.fix ? `\n    ${pc.dim(`fix: ${c.fix}`)}` : ""}`,
    );
  if (lines.length) ui.note(lines.join("\n"), "What needs attention");
  if (dirty(st))
    ui.info(pc.dim("Checks ran against the files on disk; unsaved changes are not included."));
  if (r.ok) st.draft.verifiedAt = new Date().toISOString();
  return r.ok;
}

/** Shows what a save will change, then writes it through the integration journal. */
export async function saveSettings(st: ControlState): Promise<{ written: string[] } | undefined> {
  const ui = uiOf(st.ctx);
  const prompts = st.ctx.env.prompts;
  const current = await readSetup(st.io.fs, st.io.prefix);
  const base = current ?? st.saved;
  const setup = { ...base, ...normalized(st.draft), name: st.name };
  let res = await planSettingsSave({
    fs: st.io.fs,
    prefix: st.io.prefix,
    setup,
    candidates: candidates(st),
  });
  if (res.edited.length) {
    const yes = await prompts?.confirm(
      `${res.edited.join(", ")} was edited by hand. Overwrite it with the terminal settings? (No keeps your edit and saves nothing)`,
      false,
    );
    if (!yes) return undefined;
    res = await planSettingsSave({
      fs: st.io.fs,
      prefix: st.io.prefix,
      setup,
      candidates: candidates(st),
      force: res.edited,
    });
  }
  const todo = res.plan.changes.filter((c) => c.action !== "keep");
  if (!todo.length) return { written: [] };
  const body: string[] = [];
  for (const c of todo) {
    body.push(
      pc.bold(
        `${c.action === "create" ? "+ new" : c.action === "delete" ? "- remove" : "~ update"}  ${c.path}`,
      ),
    );
    if (c.action === "update" && c.before !== undefined && c.content !== undefined) {
      const changed = lineDiff(c.before, c.content).filter(
        (l) => l.startsWith("+") || l.startsWith("-"),
      );
      body.push(...changed.slice(0, 24).map((l) => (l.startsWith("+") ? pc.green(l) : pc.red(l))));
      if (changed.length > 24) body.push(pc.dim(`  … ${changed.length - 24} more changed lines`));
    } else if (c.action === "create" && c.content)
      body.push(pc.dim(`  ${c.content.split("\n").length} lines`));
  }
  ui.note(body.join("\n"), "Review the changes");
  if (res.overrides.length)
    ui.warn(
      `speeq.config.ts sets ${res.overrides.join(", ")} itself, so those terminal settings are overridden. Remove them there to let setup manage them.`,
    );
  for (const n of res.notes) ui.info(pc.dim(n));
  if (res.manual)
    ui.note(res.manual.snippet, `Add this to speeq.config.ts by hand (${res.manual.reason})`);
  if (prompts && !(await prompts.confirm("Save these changes?", true))) return undefined;
  const applied = await applyPlan(st.io.fs, res.plan);
  if (applied.status === "conflict") {
    ui.fail(`Nothing was written: ${applied.conflicts.join("; ")}`);
    return undefined;
  }
  if (applied.status === "failed") {
    ui.fail(`Nothing was written: ${applied.reason}${applied.restored ? " (restored)" : ""}`);
    return undefined;
  }
  const written = applied.status === "applied" ? [...applied.written, ...applied.removed] : [];
  ui.note(
    [
      ...written.map((w) => `${pc.green("✓")} ${w}`),
      "",
      restartHint(written),
      `Undo with: ${pc.bold("npx speeq rollback")}`,
    ].join("\n"),
    "Saved",
  );
  return { written };
}

/** The state as JSON for `speeq setup --json` (no secrets: key presence only). */
export async function stateJson(st: ControlState): Promise<Record<string, unknown>> {
  const input = await controlInput(st);
  const statuses = sectionStatuses(input);
  return {
    sections: statuses.map((s, i) => ({ n: i + 1, ...s })),
    recommended: recommend(input, statuses) ?? null,
    wiring: input.wiring,
    auth: (st.found?.auth.candidates ?? []).map((c) => ({
      provider: c.provider,
      label: c.label,
      level: c.level,
      evidence: c.evidence.map((e) => `${e.file}:${e.line}`),
      notes: c.notes,
    })),
    dataSources: candidates(st).map((c) => ({
      id: c.id,
      path: c.path,
      category: c.category,
      binding: c.binding,
      authEvidence: c.authEvidence,
      fields: c.fields,
    })),
    business: st.found?.business ?? null,
    settings: normalized(st.draft),
  };
}

/**
 * The control center loop. Returns `save` when the developer chose Save, `cancel` otherwise.
 * `start` deep-links into one section first.
 */
export async function homeLoop(st: ControlState, start?: SectionId): Promise<"save" | "cancel"> {
  const ctx: Ctx = st.ctx;
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  if (!prompts) return "cancel";
  if (start) await open(st, start);
  for (;;) {
    ui.note(await card(st), "speeq · personalised application intelligence");
    const input = await controlInput(st);
    const statuses = sectionStatuses(input);
    const rec = recommend(input, statuses);
    const choice = await prompts.select("What next?", [
      ...(rec
        ? [{ value: `rec:${rec.section}`, label: `★ ${rec.text}`, hint: "recommended" }]
        : []),
      ...statuses.map((s, i) => ({
        value: s.id as string,
        label: `${String(i + 1).padStart(2, "0")}  ${s.title}`,
        hint: `${PLAIN_BADGE[s.badge]} ${clip(s.detail, 36)}`,
      })),
      { value: "apply", label: "✔ Save and finish", hint: "review the changes, then write them" },
      { value: "test", label: "▶ Test agent", hint: "static checks and a mock-model smoke test" },
      { value: "?", label: "? Help", hint: "" },
      { value: "cancel", label: "✗ Exit without saving", hint: "nothing is written" },
    ]);
    if (choice === "apply") return "save";
    if (choice === "cancel") {
      if (
        dirty(st) &&
        !(await prompts.confirm("You have unsaved changes. Exit anyway and lose them?", false))
      )
        continue;
      return "cancel";
    }
    if (choice === "?") {
      ui.note(
        "Pick a section to change it. Nothing is written until Save, which shows every change first and can be undone with `npx speeq rollback`. Ctrl+C at any time writes nothing.\nDeep links: `npx speeq setup auth`, `npx speeq setup 06`. Without a terminal: `npx speeq setup --json`.",
        "Help",
      );
      continue;
    }
    if (choice === "test") {
      await runChecks(st);
      continue;
    }
    await open(st, (choice.startsWith("rec:") ? choice.slice(4) : choice) as SectionId);
  }
}

async function open(st: ControlState, id: SectionId) {
  if (id === "verify") {
    await runChecks(st);
    return;
  }
  await RUNNERS[id](st);
}
