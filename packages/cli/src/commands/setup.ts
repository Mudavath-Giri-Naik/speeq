import {
  applyEnvValues,
  configProviderState,
  configStoreState,
  configVoiceState,
  ignoresEnvLocal,
  keepStoreAcrossReloads,
  nodeFs,
  ownership,
  PROVIDERS,
  type ProjectFs,
  readSetup,
  type Setup,
  setupPath,
  switchProvider,
  switchVoice,
  VOICES,
} from "@speeq/integrate";
import pc from "picocolors";
import { load, projectRoot } from "../load.js";
import { sync } from "../sync.js";
import { CliExit, type Ctx, EXIT } from "../types.js";
import { uiOf } from "../ui.js";
import { type Choices, neededValues, runWizard, type VoiceId, type WizardIo } from "../wizard.js";

/** The value of a variable in env file text, in memory only. */
function valueIn(text: string | undefined, name: string): string | undefined {
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  let last: string | undefined;
  for (const line of text?.split(/\r?\n/) ?? []) {
    const raw = re
      .exec(line)?.[1]
      ?.trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (raw) last = raw;
  }
  return last;
}
const NOTES: Record<string, string> = {
  SPEEQ_LLM_MODEL: "Model used by the assistant",
  SPEEQ_LLM_BASE_URL: "API base URL",
  GROQ_STT_MODEL: "Groq speech-to-text model",
  GEMINI_STT_MODEL: "Gemini speech-to-text model",
};

/** Keep `.env.local` out of git. */
async function ensureIgnored(fs: ProjectFs, prefix: string) {
  const path = `${prefix}.gitignore`;
  const text = (await fs.read(path)) ?? "";
  if (ignoresEnvLocal(text)) return;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = text === "" || text.endsWith("\n") ? "" : nl;
  await fs.write(path, `${text}${lead}# speeq: local secrets${nl}.env*.local${nl}`);
}

/** Save pasted keys and chosen models in `.env.local`. Existing different values are replaced only with a yes. */
async function saveValues(ctx: Ctx, io: WizardIo, c: Choices): Promise<string[]> {
  const ui = uiOf(ctx);
  const values = neededValues(c);
  if (Object.keys(values).length === 0) return [];
  const path = `${io.prefix}.env.local`;
  const existing = await io.fs.read(path);
  let result = applyEnvValues(existing, values, { notes: NOTES });
  const differing = result.skipped.filter((n) => valueIn(existing, n) !== values[n]);
  let overwrite: string[] = [];
  if (differing.length) {
    const yes = await ctx.env.prompts?.confirm(
      `${path} already has a different value for ${differing.join(", ")}. Replace it?`,
      false,
    );
    if (yes) overwrite = differing;
    else ui.warn(`Kept your existing ${differing.join(", ")}.`);
  }
  result = applyEnvValues(existing, values, { notes: NOTES, overwrite });
  const names = [...result.filled, ...result.added, ...result.replaced];
  if (names.length) {
    await io.fs.write(path, result.text);
    await ensureIgnored(io.fs, io.prefix);
    ui.ok(`Saved ${names.join(", ")} in ${path}`);
  }
  return names;
}

/** `speeq.config.ts` is yours: change its provider or speech only with a yes, and keep a copy. */
async function alignConfig(ctx: Ctx, io: WizardIo, c: Choices) {
  const ui = uiOf(ctx);
  const path = `${io.prefix}speeq.config.ts`;
  const text = await io.fs.read(path);
  const p = PROVIDERS.find((x) => x.id === c.provider);
  const v = VOICES.find((x) => x.id === c.voice);
  if (text === undefined || !p || !v) return;
  const llmOff = configProviderState(text, p) === "mismatch";
  const voiceOff = configVoiceState(text, v) === "mismatch";
  const storeOff = configStoreState(text) === "mismatch";
  if (!llmOff && !voiceOff && !storeOff) return;
  let next = text;
  const manual: string[] = [];
  if (llmOff) {
    const r = switchProvider(next, p);
    if ("reason" in r) manual.push(`llm: ${p.expression}`);
    else next = r.text;
  }
  if (voiceOff) {
    const r = switchVoice(next, v);
    if ("reason" in r)
      manual.push(v.config.length ? v.config.join("\n") : "(remove the `speech` setting)");
    else next = r.text;
  }
  if (storeOff) {
    const r = keepStoreAcrossReloads(next);
    if ("reason" in r)
      manual.push(
        "Keep the store on globalThis so the assistant remembers the conversation after a reload.",
      );
    else next = r.text;
  }
  const what = [llmOff && "model provider", voiceOff && "voice", storeOff && "conversation memory"]
    .filter(Boolean)
    .join(" and ");
  if (next !== text) {
    const yes = await ctx.env.prompts?.confirm(
      `${path} can be updated (${what}). Update it? A copy is kept in .speeq/backups.`,
      true,
    );
    if (yes) {
      await io.fs.write(`${io.prefix}.speeq/backups/speeq.config.before-setup.ts`, text);
      await io.fs.write(path, next);
      ui.ok(`Updated ${path}`);
    } else manual.push("(left as it was)");
  }
  if (manual.length) ui.note(manual.join("\n\n"), `Change ${path} by hand`);
}

/** Remember the choices so `speeq upgrade` regenerates the same files. Returns the setup that was there. */
async function saveSetup(io: WizardIo, c: Choices): Promise<Setup | undefined> {
  const prev = await readSetup(io.fs, io.prefix);
  if (!prev) return undefined;
  const next: Setup = {
    ...prev,
    provider: c.provider,
    voice: c.voice,
    languages: c.languages,
    ui: c.ui,
  };
  if (JSON.stringify(prev) !== JSON.stringify(next))
    await io.fs.write(setupPath(io.prefix), `${JSON.stringify(next, null, 2)}\n`);
  return prev;
}

/** Write everything a finished wizard decided. Returns the names saved in `.env.local`. */
export async function applyChoices(
  ctx: Ctx,
  io: WizardIo,
  c: Choices,
  opts: { regenerate: boolean },
): Promise<{ names: string[] }> {
  const ui = uiOf(ctx);
  const names = await saveValues(ctx, io, c);
  await alignConfig(ctx, io, c);
  const prev = await saveSetup(io, c);
  const changed =
    !prev ||
    prev.voice !== c.voice ||
    prev.ui !== c.ui ||
    prev.languages.join() !== c.languages.join() ||
    (prev.provider === "mock") !== (c.provider === "mock");
  // A generated chat box from an older speeq is refreshed too: updating the package does not rewrite it.
  let stale = false;
  for (const f of ["components/speeq/assistant.tsx", "src/components/speeq/assistant.tsx"])
    if (ownership(await io.fs.read(`${io.prefix}${f}`)) === "owned") stale = true;
  if (opts.regenerate && (changed || stale)) {
    const busy = ui.busy("Updating the chat box and generated files (scanning your app)");
    const loaded = await load(ctx);
    busy.stop("Scan finished");
    await sync(ctx, loaded);
  }
  return { names };
}

/** The choices a project already has, or sensible defaults. */
export function initialChoices(prev: Setup | undefined): Choices {
  return {
    provider: prev?.provider ?? "groq",
    voice: (prev?.voice ?? "browser") as VoiceId,
    languages: prev?.languages ?? ["en-IN"],
    ui: prev?.ui ?? true,
    values: {},
    known: {},
  };
}

/** `speeq setup` (also `speeq connect`): change the model, voice, languages and keys of an existing setup. */
export async function setupCommand(ctx: Ctx): Promise<number> {
  const prompts = ctx.env.prompts;
  if (!ctx.interactive || !prompts)
    throw new CliExit(
      EXIT.usage,
      "speeq setup needs a terminal: it asks for your key without showing it. Without one, put the key in .env.local yourself.",
      "usage",
    );
  const ui = uiOf(ctx);
  const fs = nodeFs(projectRoot(ctx));
  const prefix = ctx.flags.app ? `${ctx.flags.app.replace(/\/+$/, "")}/` : "";
  const io: WizardIo = { fs, prefix };
  const prev = await readSetup(fs, prefix);
  if (!prev && (await fs.read(`${prefix}speeq.config.ts`)) === undefined)
    throw new CliExit(
      EXIT.failure,
      "speeq is not set up in this folder yet. Run `npx speeq init` first.",
      "not-initialised",
    );
  const start = initialChoices(prev);
  if (ctx.flags.provider && PROVIDERS.some((p) => p.id === ctx.flags.provider))
    start.provider = ctx.flags.provider;
  const c = await runWizard(ctx, io, start, "edit");
  if (!c) {
    ui.outro("Cancelled. Nothing was written.");
    return ctx.finish(EXIT.ok, { cancelled: true });
  }
  const { names } = await applyChoices(ctx, io, c, { regenerate: true });
  ui.outro(
    names.length
      ? `${pc.green("Done.")} Restart your dev server so it reads ${prefix}.env.local.`
      : `${pc.green("Done.")} Restart your dev server if you changed anything.`,
  );
  return ctx.finish(EXIT.ok, { provider: c.provider, voice: c.voice, saved: names });
}
