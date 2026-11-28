import { keyVariable, PROVIDERS, type ProjectFs } from "@speeq/integrate";
import pc from "picocolors";
import {
  baseFor,
  checkKey,
  checkSarvam,
  type KeyCheck,
  MAX_MODELS,
  type ModelResult,
  type ProbeProvider,
  testModels,
  testSarvamVoice,
  testStt,
} from "./probe.js";
import { CliExit, type Ctx, EXIT } from "./types.js";
import { pad, plain, speedBar, type Ui, uiOf } from "./ui.js";

export type VoiceId = "none" | "browser" | "cloud" | "sarvam";
/** Where the wizard reads and writes. `prefix` is the app folder inside a monorepo, or empty. */
export interface WizardIo {
  fs: ProjectFs;
  prefix: string;
}
/** Everything the wizard decides. `values` are the pairs to put in `.env.local` and are never printed. */
export interface Choices {
  provider: string;
  voice: VoiceId;
  languages: string[];
  ui: boolean;
  values: Record<string, string>;
  /** Keys already saved in the app's env files and checked this session. Kept in memory, never written. */
  known: Record<string, string>;
  /** More variable names to save from `values` (the control center's MongoDB settings). */
  extraEnv?: string[];
  /** Short facts for the review screen. */
  model?: string;
  voiceNote?: string;
}

const BACK = "__back" as const;
const SKIP = "__skip" as const;
const PROVIDER_CHOICES = [
  { id: "groq", label: "Groq", hint: "free tier, very fast" },
  { id: "gemini", label: "Google Gemini", hint: "free tier, strong with Indian languages" },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "one key, many models (only free ones are tested)",
  },
  {
    id: "openai-compatible",
    label: "Other OpenAI-compatible server",
    hint: "Ollama, LM Studio, any /v1 API",
  },
  { id: "mock", label: "Mock (no key)", hint: "canned replies, good for a first look" },
] as const;
const VOICE_CHOICES: { id: VoiceId; label: string; hint: string }[] = [
  { id: "browser", label: "Browser voice", hint: "free, no key (Chrome and Edge)" },
  {
    id: "cloud",
    label: "Cloud speech-to-text",
    hint: "Groq Whisper + Gemini, free tiers, better for Telugu and Hindi",
  },
  {
    id: "sarvam",
    label: "Sarvam AI voice",
    hint: "paid credits, best for Indian languages, speaks replies too",
  },
  { id: "none", label: "Text only", hint: "no microphone" },
];
const LANGUAGE_CHOICES = [
  { value: "en-IN", label: "English" },
  { value: "te-IN", label: "Telugu" },
  { value: "hi-IN", label: "Hindi" },
];
const HOSTS: Record<string, string> = {
  groq: "api.groq.com",
  gemini: "generativelanguage.googleapis.com",
  openrouter: "openrouter.ai",
  sarvam: "api.sarvam.ai",
};
const providerName = (id: string) => PROVIDER_CHOICES.find((p) => p.id === id)?.label ?? id;
const voiceName = (id: string) => VOICE_CHOICES.find((v) => v.id === id)?.label ?? id;
const langName = (tag: string) => LANGUAGE_CHOICES.find((l) => l.value === tag)?.label ?? tag;

/** A key already saved for this app, from `.env.local` or `.env` (or the environment). Read in memory only. */
async function existingKey(ctx: Ctx, io: WizardIo, name: string) {
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const file of [`${io.prefix}.env.local`, `${io.prefix}.env`]) {
    const text = await io.fs.read(file);
    for (const line of text?.split(/\r?\n/) ?? []) {
      const raw =
        re
          .exec(line)?.[1]
          ?.trim()
          .replace(/^(["'])(.*)\1$/, "$2") ?? "";
      if (raw && !raw.startsWith("#")) return { value: raw, source: file.replace(io.prefix, "") };
    }
  }
  const fromEnv = ctx.env.env[name];
  return fromEnv ? { value: fromEnv, source: "your environment" } : undefined;
}

type Verdict<T> = { ok: true; detail: string; data: T } | { ok: false; message: string };
type KeyAnswer<T> = { key: string; data: T } | typeof BACK | typeof SKIP;

/**
 * Get a key from the developer, check it at once, and only return once it is accepted. Offers a key that
 * is already saved, a hidden paste, skipping, and going back. The key is never printed.
 */
async function askKey<T>(
  ctx: Ctx,
  io: WizardIo,
  c: Choices,
  o: {
    label: string;
    name: string;
    host: string;
    back: boolean;
    check(key: string): Promise<Verdict<T>>;
  },
): Promise<KeyAnswer<T>> {
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  if (!prompts) throw new CliExit(EXIT.usage, "This needs a terminal.", "usage");
  const verify = async (key: string): Promise<{ key: string; data: T } | undefined> => {
    const busy = ui.busy(`Checking your ${o.label} key with ${o.host}`);
    const v = await o.check(key);
    if (v.ok) {
      busy.stop(`${o.label} key accepted ${pc.dim(`· ${v.detail}`)}`);
      return { key, data: v.data };
    }
    busy.stop(`${o.label}: ${v.message}`, false);
    return undefined;
  };
  const pasted = c.values[o.name] ?? c.known[o.name];
  if (pasted) {
    const again = await verify(pasted);
    if (again) return again;
    delete c.values[o.name];
    delete c.known[o.name];
  }
  ui.info(
    pc.dim(`Your key goes only to ${o.host}. It is never printed and is saved only in .env.local.`),
  );
  for (;;) {
    const saved = await existingKey(ctx, io, o.name);
    const options: { value: string; label: string; hint?: string }[] = [];
    if (saved)
      options.push({
        value: "use",
        label: `Use the key already in ${saved.source}`,
        hint: `${o.name}, ${saved.value.length} characters`,
      });
    options.push(
      { value: "paste", label: "Paste a key now", hint: "hidden as you type" },
      { value: SKIP, label: "Skip, I will add it later" },
    );
    if (o.back) options.push({ value: BACK, label: "← Back" });
    const how = await prompts.select(`Your ${o.label} key`, options);
    if (how === BACK || how === SKIP) return how;
    if (how === "use" && saved) {
      const ok = await verify(saved.value);
      if (ok) {
        c.known[o.name] = saved.value; // already in the file: nothing to write
        return ok;
      }
      continue;
    }
    const key = (await prompts.password(`Paste your ${o.label} key (Enter to go back)`)).trim();
    if (!key) continue;
    if (/\s/.test(key)) {
      ui.fail("That has spaces or line breaks in it. Paste the key alone.");
      continue;
    }
    const ok = await verify(key);
    if (ok) {
      c.values[o.name] = key;
      return ok;
    }
  }
}

const STATUS_ORDER = { working: 0, busy: 1, limited: 2, failed: 3 } as const;
/** A tidy table of test results: fastest working models first. */
function resultTable(results: readonly ModelResult[], max = 14): string {
  const sorted = [...results].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.ms - b.ms,
  );
  const w = Math.min(34, Math.max(...sorted.map((r) => r.model.length), 10));
  const shown = sorted.slice(0, max);
  const lines = shown.map((r) => {
    const name = pad(r.model.length > w ? `${r.model.slice(0, w - 1)}…` : r.model, w);
    if (r.status === "working")
      return `${pc.green("✓")} ${name}  ${pad(pc.dim(`${r.ms} ms`), 9)} ${speedBar(r.ms)}`;
    if (r.status === "failed")
      return `${pc.red("✗")} ${pc.dim(name)}  ${pc.dim(r.reason ?? "not available")}`;
    return `${pc.yellow("!")} ${name}  ${pc.yellow(r.reason ?? r.status)}`;
  });
  if (sorted.length > shown.length)
    lines.push(pc.dim(`… and ${sorted.length - shown.length} more that did not work`));
  return lines.join("\n");
}
const counts = (r: readonly ModelResult[]) =>
  `${r.filter((x) => x.status === "working").length} working · ${r.filter((x) => x.status === "busy" || x.status === "limited").length} busy or limited · ${r.filter((x) => x.status === "failed").length} unavailable`;

/** Test models with a progress bar and print the table. */
async function runTests(
  ui: Ui,
  title: string,
  models: readonly string[],
  run: (onResult: (r: ModelResult) => void) => Promise<ModelResult[]>,
): Promise<ModelResult[]> {
  const bar = ui.bar(models.length, `${title}: testing ${models.length}`);
  let done = 0;
  const results = await run((r) =>
    bar.advance(`${title}: ${++done}/${models.length} · ${r.model}`),
  );
  bar.stop(`${title}: ${counts(results)}`);
  ui.note(resultTable(results), title);
  return results;
}

/** Step: which language model. */
async function modelStep(
  ctx: Ctx,
  io: WizardIo,
  c: Choices,
  canBack: boolean,
): Promise<"next" | "back"> {
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  if (!prompts) return "next";
  for (;;) {
    const opts: { value: string; label: string; hint: string }[] = PROVIDER_CHOICES.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.hint,
    }));
    if (canBack) opts.push({ value: BACK, label: "← Back", hint: "" });
    const id = await prompts.select("Which language model do you want to use?", opts, c.provider);
    if (id === BACK) return "back";
    const p = PROVIDERS.find((x) => x.id === id);
    if (!p) continue;
    c.provider = id;
    delete c.model;
    if (!p.needsKey) {
      ui.ok("Mock mode: canned replies, no key needed. Switch with `npx speeq setup` any time.");
      return "next";
    }
    let baseUrl: string | undefined;
    if (id === "openai-compatible") {
      baseUrl = (
        await prompts.text(
          "API base URL (for example http://localhost:11434/v1)",
          c.values.SPEEQ_LLM_BASE_URL ?? "",
        )
      ).trim();
      const safe = baseFor("openai-compatible", baseUrl);
      if (!safe) {
        ui.fail("Use https (http only for localhost), with no password or query in the URL.");
        continue;
      }
      c.values.SPEEQ_LLM_BASE_URL = safe;
    }
    const probe = id as ProbeProvider;
    const keyName = keyVariable(p) ?? "";
    const host = HOSTS[id] ?? new URL(baseUrl ?? "https://invalid.invalid").host;
    const answer = await askKey<Extract<KeyCheck, { ok: true }>>(ctx, io, c, {
      label: providerName(id),
      name: keyName,
      host,
      back: true,
      check: async (key) => {
        const r = await checkKey({
          provider: probe,
          key,
          ...(baseUrl ? { baseUrl } : {}),
          ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}),
        });
        return r.ok
          ? { ok: true, detail: `${r.total} chat models available`, data: r }
          : { ok: false, message: `${r.message} Copy it again from the provider's key page.` };
      },
    });
    if (answer === BACK) continue;
    if (answer === SKIP) {
      ui.warn(
        `No key yet. Add ${keyName} and SPEEQ_LLM_MODEL to .env.local before you run the app.`,
      );
      return "next";
    }
    const { key, data } = answer;
    const models = data.models;
    if (models.length === 0) {
      ui.warn("The key works, but no chat models were listed.");
    } else if (
      id !== "openai-compatible" ||
      (await prompts.confirm(
        `Send one tiny test message to each of ${models.length} models? (may use paid quota on some servers)`,
        false,
      ))
    ) {
      const more = data.total > models.length ? ` (the first ${MAX_MODELS} of ${data.total})` : "";
      ui.info(pc.dim(`Each model gets one message of a few tokens${more}.`));
      const results = await runTests(ui, "Models", models, (on) =>
        testModels(
          {
            provider: probe,
            key,
            ...(baseUrl ? { baseUrl } : {}),
            ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}),
          },
          models,
          on,
        ),
      );
      const usable = results
        .filter((r) => r.status !== "failed")
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.ms - b.ms);
      if (usable.length) {
        const options = [
          ...usable.map((r, i) => ({
            value: r.model,
            label: r.model,
            hint:
              r.status === "working"
                ? `${i === 0 ? "fastest · " : ""}${r.ms} ms`
                : `${r.status === "busy" ? "busy right now" : "rate limited"}, may work later`,
          })),
          { value: "__type", label: "Type a model id myself", hint: "" },
          { value: BACK, label: "← Back", hint: "" },
        ];
        const picked = await prompts.select(
          "Which model should speeq use?",
          options,
          usable[0]?.model,
        );
        if (picked === BACK) continue;
        if (picked !== "__type") {
          c.values.SPEEQ_LLM_MODEL = picked;
          c.model = picked;
          ui.ok(`${providerName(id)} · ${picked}`);
          return "next";
        }
      } else ui.warn("None of the listed models answered right now.");
    }
    const typed = (await prompts.text("Model id to use (Enter to set it later)")).trim();
    if (typed) {
      c.values.SPEEQ_LLM_MODEL = typed;
      c.model = typed;
    } else ui.warn("Set SPEEQ_LLM_MODEL in .env.local before you run the app.");
    return "next";
  }
}

/** Test speech-to-text models and return the fastest one that answered. */
async function bestStt(
  ctx: Ctx,
  ui: Ui,
  provider: "groq" | "gemini",
  key: string,
  models: readonly string[],
): Promise<string | undefined> {
  if (models.length === 0) return undefined;
  const results = await runTests(
    ui,
    `${providerName(provider)} speech-to-text`,
    models,
    async (on) => {
      const out: ModelResult[] = [];
      for (const m of models) {
        const r = await testStt(
          { provider, key, ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}) },
          m,
        );
        out.push(r);
        on(r);
      }
      return out;
    },
  );
  return results.filter((r) => r.status === "working").sort((a, b) => a.ms - b.ms)[0]?.model;
}

/** Step: voice. */
async function voiceStep(ctx: Ctx, io: WizardIo, c: Choices): Promise<"next" | "back"> {
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  if (!prompts) return "next";
  for (;;) {
    const id = (await prompts.select(
      "How should people talk to the assistant?",
      [
        ...VOICE_CHOICES.map((v) => ({ value: v.id as string, label: v.label, hint: v.hint })),
        { value: BACK, label: "← Back", hint: "" },
      ],
      c.voice,
    )) as VoiceId | typeof BACK;
    if (id === BACK) return "back";
    delete c.voiceNote;
    if (id === "browser" || id === "none") {
      c.voice = id;
      ui.ok(voiceName(id));
      return "next";
    }
    if (id === "sarvam") {
      ui.note(
        "Sarvam is a paid service (new accounts start with free credits).\nspeeq only uses it because you chose it here, and only for voice.",
        "Sarvam AI",
      );
      const answer = await askKey<null>(ctx, io, c, {
        label: "Sarvam",
        name: "SARVAM_API_KEY",
        host: HOSTS.sarvam as string,
        back: true,
        check: async (key) => {
          const r = await checkSarvam(key, ctx.env.fetch);
          return r.ok
            ? { ok: true, detail: "no credits used for this check", data: null }
            : { ok: false, message: r.message };
        },
      });
      if (answer === BACK) continue;
      if (answer === SKIP) {
        c.voice = "sarvam";
        c.voiceNote = "key not added yet";
        ui.warn("Add SARVAM_API_KEY to .env.local. Until then the assistant uses browser voice.");
        return "next";
      }
      if (
        await prompts.confirm(
          "Speak a two-letter test with Sarvam? (uses a few characters of your credits)",
          true,
        )
      ) {
        const busy = ui.busy("Asking Sarvam to speak");
        const t = await testSarvamVoice(answer.key, ctx.env.fetch);
        busy.stop(
          t.ok
            ? `Sarvam voice works ${pc.dim(`· ${t.ms} ms`)}`
            : `Sarvam voice test failed: ${t.reason}`,
          t.ok,
        );
        if (!t.ok && !(await prompts.confirm("Use Sarvam anyway?", false))) continue;
      }
      c.voice = "sarvam";
      c.voiceNote = "speech-to-text and text-to-speech";
      ui.ok("Sarvam AI voice");
      return "next";
    }
    // cloud: Groq Whisper and Gemini audio
    ui.note(
      "Free tiers. Groq Whisper handles English; Gemini handles Telugu and Hindi.\nBoth keys are needed.",
      "Cloud speech-to-text",
    );
    const groq = await askKey<Extract<KeyCheck, { ok: true }>>(ctx, io, c, {
      label: "Groq",
      name: "GROQ_API_KEY",
      host: HOSTS.groq as string,
      back: true,
      check: async (key) => {
        const r = await checkKey({
          provider: "groq",
          key,
          ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}),
        });
        return r.ok
          ? { ok: true, detail: `${r.stt.length} speech models`, data: r }
          : { ok: false, message: r.message };
      },
    });
    if (typeof groq === "string") continue;
    const gemini = await askKey<Extract<KeyCheck, { ok: true }>>(ctx, io, c, {
      label: "Gemini",
      name: "GEMINI_API_KEY",
      host: HOSTS.gemini as string,
      back: true,
      check: async (key) => {
        const r = await checkKey({
          provider: "gemini",
          key,
          ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}),
        });
        return r.ok
          ? { ok: true, detail: `${r.total} models`, data: r }
          : { ok: false, message: r.message };
      },
    });
    if (typeof gemini === "string") continue;
    const gm = groq.data.stt.slice(0, 3);
    const mm = gemini.data.models.filter((m) => /flash/i.test(m)).slice(0, 4);
    const [groqModel, geminiModel] = [
      await bestStt(ctx, ui, "groq", groq.key, gm),
      await bestStt(ctx, ui, "gemini", gemini.key, mm),
    ];
    if (!groqModel || !geminiModel) {
      ui.fail(
        `No ${!groqModel ? "Groq" : "Gemini"} speech model answered. Pick another voice or try again later.`,
      );
      continue;
    }
    c.values.GROQ_STT_MODEL = groqModel;
    c.values.GEMINI_STT_MODEL = geminiModel;
    c.voice = "cloud";
    c.voiceNote = `${groqModel} + ${geminiModel}`;
    ui.ok(`Cloud speech-to-text · ${groqModel} + ${geminiModel}`);
    return "next";
  }
}

async function languagesStep(ctx: Ctx, c: Choices): Promise<"next" | "back"> {
  const picked = await ctx.env.prompts?.multiselect(
    "Which languages should people speak?",
    LANGUAGE_CHOICES,
    c.languages,
  );
  c.languages = picked?.length ? picked : ["en-IN"];
  uiOf(ctx).ok(c.languages.map(langName).join(", "));
  return "next";
}
async function chatStep(ctx: Ctx, c: Choices): Promise<"next" | "back"> {
  c.ui = (await ctx.env.prompts?.confirm("Add the chat box to your site's layout?", c.ui)) ?? c.ui;
  uiOf(ctx).ok(
    c.ui ? "The chat box will be added to your layout" : "No chat box (you can add it later)",
  );
  return "next";
}

const STEPS = [
  { id: "model", title: "Language model" },
  { id: "voice", title: "Voice" },
  { id: "languages", title: "Languages" },
  { id: "chat", title: "Chat box" },
] as const;
/** A wizard step the control center can open on its own. */
export type StepId = (typeof STEPS)[number]["id"];
/** Runs one wizard step (also used by the control center sections). */
export async function runStep(ctx: Ctx, io: WizardIo, c: Choices, id: StepId, canBack: boolean) {
  if (id === "model") return modelStep(ctx, io, c, canBack);
  if (id === "voice") return voiceStep(ctx, io, c);
  if (id === "languages") return languagesStep(ctx, c);
  return chatStep(ctx, c);
}

const summary = (c: Choices) => [
  [
    "Language model",
    c.provider === "mock"
      ? "Mock (canned replies)"
      : `${providerName(c.provider)}${c.model ? ` · ${c.model}` : pc.yellow(" · model not set")}`,
  ],
  ["Voice", `${voiceName(c.voice)}${c.voiceNote ? pc.dim(` · ${c.voiceNote}`) : ""}`],
  ["Languages", c.languages.map(langName).join(", ")],
  ["Chat box", c.ui ? "added to your layout" : "not added"],
];
/** The review screen. Pick any line to change it, or apply. Returns false when the developer cancels. */
async function review(ctx: Ctx, io: WizardIo, c: Choices): Promise<boolean> {
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  if (!prompts) return true;
  for (;;) {
    const rows = summary(c);
    ui.note(rows.map(([k, v]) => `${pc.dim(pad(k as string, 15))} ${v}`).join("\n"), "Your setup");
    const choice = await prompts.select("What next?", [
      {
        value: "apply",
        label: "✔ Looks good, apply it",
        hint: "writes files and saves your keys in .env.local",
      },
      ...STEPS.map((s, i) => ({
        value: s.id as string,
        label: `Change: ${s.title}`,
        hint: plain(`${rows[i]?.[1] ?? ""}`),
      })),
      { value: "cancel", label: "✗ Cancel", hint: "nothing is written" },
    ]);
    if (choice === "apply") return true;
    if (choice === "cancel") return false;
    await runStep(ctx, io, c, choice as StepId, false);
  }
}

/**
 * The setup wizard: language model, voice, languages, chat box, then a review screen where any part can be
 * changed. Every key is checked the moment it is given. `first` walks the steps in order (with Back);
 * otherwise it opens on the review screen. Returns `undefined` when cancelled.
 */
export async function runWizard(
  ctx: Ctx,
  io: WizardIo,
  start: Choices,
  mode: "first" | "edit",
): Promise<Choices | undefined> {
  const ui = uiOf(ctx);
  const c: Choices = {
    ...start,
    values: { ...start.values },
    known: { ...start.known },
    languages: [...start.languages],
  };
  ui.intro(mode === "first" ? "Let's set up your assistant" : "Change your setup");
  if (mode === "first") {
    for (let i = 0; i < STEPS.length; ) {
      const s = STEPS[i] as (typeof STEPS)[number];
      ui.step(i + 1, STEPS.length, s.title);
      const r = await runStep(ctx, io, c, s.id, i > 0);
      i = r === "back" ? Math.max(0, i - 1) : i + 1;
    }
  }
  return (await review(ctx, io, c)) ? c : undefined;
}

/** The names a setup needs in `.env.local`, so values for a provider the developer moved away from are dropped. */
export function neededValues(c: Choices): Record<string, string> {
  const p = PROVIDERS.find((x) => x.id === c.provider);
  const names = new Set<string>(p?.env.map((e) => e.name) ?? []);
  if (c.voice === "cloud")
    for (const n of ["GROQ_API_KEY", "GEMINI_API_KEY", "GROQ_STT_MODEL", "GEMINI_STT_MODEL"])
      names.add(n);
  if (c.voice === "sarvam") names.add("SARVAM_API_KEY");
  for (const n of c.extraEnv ?? []) names.add(n);
  return Object.fromEntries(Object.entries(c.values).filter(([k]) => names.has(k)));
}
