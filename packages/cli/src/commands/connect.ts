import {
  applyEnvValues,
  configProviderState,
  type EnvValueResult,
  ignoresEnvLocal,
  keyVariable,
  nodeFs,
  PROVIDERS,
  type ProjectFs,
  type ProviderEntry,
  readSetup,
  setupPath,
  switchProvider,
} from "@speeq/integrate";
import pc from "picocolors";
import { projectRoot } from "../load.js";
import {
  baseFor,
  checkKey,
  MAX_MODELS,
  type ModelResult,
  type ProbeProvider,
  testModels,
} from "../probe.js";
import { CliExit, type Ctx, EXIT } from "../types.js";

/** What `connect` did. Names only: the key is never part of a result. */
export interface ConnectResult {
  /** The key was saved to `.env.local`. */
  saved: boolean;
  model?: string;
  /** Variables written to `.env.local`. */
  names: string[];
}

const MODEL_VAR = "SPEEQ_LLM_MODEL";
const BASE_VAR = "SPEEQ_LLM_BASE_URL";
const HOSTS: Record<string, string> = {
  groq: "api.groq.com",
  gemini: "generativelanguage.googleapis.com",
  openrouter: "openrouter.ai",
};
const show = (r: ModelResult) => {
  const ms = `${r.ms} ms`.padStart(8);
  if (r.status === "working") return `  ${pc.green("✓")} ${r.model}${pc.dim(ms)}`;
  if (r.status === "limited") return `  ${pc.yellow("!")} ${r.model}  ${pc.dim(r.reason ?? "")}`;
  return `  ${pc.red("✗")} ${r.model}  ${pc.dim(r.reason ?? "")}`;
};

/**
 * Ask for the provider's key (hidden), check it, test the models, let the developer pick one that works,
 * and save the key and model into `.env.local`. The key is sent only to the provider's own host, never
 * printed, and written nowhere but `.env.local`. Returns `saved: false` when the developer skipped.
 */
export async function runConnect(
  ctx: Ctx,
  io: { fs: ProjectFs; prefix: string; providerId: string },
): Promise<ConnectResult> {
  const prompts = ctx.env.prompts;
  const p = PROVIDERS.find((x) => x.id === io.providerId);
  const none: ConnectResult = { saved: false, names: [] };
  if (!prompts) throw new CliExit(EXIT.usage, "This needs a terminal.", "usage");
  if (!p || !p.needsKey || !keyVariable(p)) {
    ctx.say("This provider needs no key.");
    return none;
  }
  const keyName = keyVariable(p) as string;
  let baseUrl: string | undefined;
  if (p.id === "openai-compatible") {
    baseUrl = (
      await prompts.text("API base URL (for example https://api.groq.com/openai/v1)")
    ).trim();
    if (!baseFor("openai-compatible", baseUrl)) {
      ctx.say(
        pc.red(
          "That base URL is not acceptable: use https (http only for localhost), with no credentials.",
        ),
      );
      return none;
    }
  }
  const host = HOSTS[p.id] ?? new URL(baseUrl ?? "https://invalid.invalid").host;
  ctx.say(
    pc.dim(
      `Your key is sent only to ${host}, never printed, and saved only in ${io.prefix}.env.local.`,
    ),
  );
  const probe = (key: string) => ({
    provider: p.id as ProbeProvider,
    key,
    ...(baseUrl ? { baseUrl } : {}),
    ...(ctx.env.fetch ? { fetch: ctx.env.fetch } : {}),
  });

  let key = "";
  let models: string[] = [];
  let total = 0;
  let verified = false;
  let force = false;
  for (let attempt = 0; attempt < 3 && !verified; attempt++) {
    key = (
      await prompts.password(`Paste your ${p.label.split(" (")[0]} API key (hidden, Enter to skip)`)
    ).trim();
    if (!key) return none;
    if (/\s/.test(key)) {
      ctx.say(pc.red("That has spaces or line breaks in it. Paste the key alone."));
      continue;
    }
    ctx.say("Checking the key...");
    const check = await checkKey(probe(key));
    if (check.ok) {
      ({ models, total } = check);
      verified = true;
    } else if (check.kind === "network") {
      ctx.say(pc.yellow(`${check.message} Check your connection.`));
      if (await prompts.confirm("Save the key anyway, without checking it?", false)) {
        force = true;
        break;
      }
    } else if (check.kind === "rejected") {
      ctx.say(pc.red(`${check.message} Copy it again from the provider's key page.`));
    } else {
      ctx.say(pc.red(check.message));
      if (await prompts.confirm("Save the key anyway, without checking it?", false)) {
        force = true;
        break;
      }
    }
  }
  if (!key || (!verified && !force)) {
    ctx.say("Nothing saved.");
    return none;
  }

  let model: string | undefined;
  if (verified) {
    if (models.length === 0) ctx.say(pc.yellow("The key works, but no chat models were listed."));
    else {
      const costly = p.id === "openai-compatible";
      if (
        !costly ||
        (await prompts.confirm(
          `Send one short test message to each of ${models.length} models? (a few tokens each; may use paid quota)`,
          false,
        ))
      ) {
        const more = total > models.length ? ` (the first ${MAX_MODELS} of ${total})` : "";
        ctx.say(`Testing ${models.length} models${more}. Each gets one tiny message.`);
        const results = await testModels(probe(key), models, (r) => ctx.say(show(r)));
        const usable = results.filter((r) => r.status !== "failed");
        const best = results.filter((r) => r.status === "working").sort((a, b) => a.ms - b.ms);
        ctx.say(`${best.length} working, ${results.length - usable.length} not available.`);
        if (usable.length) {
          const picked = await prompts.select(
            "Which model should speeq use?",
            [...best, ...usable.filter((r) => r.status === "limited")].map((r, i) => ({
              value: r.model,
              label: r.model,
              hint:
                r.status === "limited"
                  ? "rate limited right now"
                  : i === 0
                    ? `fastest, ${r.ms} ms`
                    : `${r.ms} ms`,
            })),
          );
          model = picked;
        }
      }
    }
  }
  if (!model && verified) {
    const typed = (await prompts.text(`Model id to use (Enter to set it later)`)).trim();
    if (typed) model = typed;
  }

  const path = `${io.prefix}.env.local`;
  const values: Record<string, string> = { [keyName]: key };
  if (model) values[MODEL_VAR] = model;
  if (baseUrl) values[BASE_VAR] = baseFor("openai-compatible", baseUrl) ?? "";
  const notes: Record<string, string> = {
    [keyName]: `${p.label.split(" (")[0]} API key`,
    [MODEL_VAR]: "Model used by the assistant",
    [BASE_VAR]: "API base URL",
  };
  const existing = await io.fs.read(path);
  let result: EnvValueResult;
  try {
    result = applyEnvValues(existing, values, { notes });
    if (result.skipped.length) {
      const replace = await prompts.confirm(
        `${path} already has a value for ${result.skipped.join(", ")}. Replace it?`,
        false,
      );
      if (replace) result = applyEnvValues(existing, values, { notes, overwrite: result.skipped });
    }
  } catch {
    ctx.say(
      pc.red(
        "Those values contain characters speeq will not write. Add them to .env.local yourself.",
      ),
    );
    return none;
  }
  await io.fs.write(path, result.text);
  const names = [...result.filled, ...result.added, ...result.replaced];
  await ensureIgnored(io.fs, io.prefix);
  ctx.say(pc.green(`Saved ${names.join(", ") || "nothing new"} in ${path}.`));
  if (result.skipped.length && !names.includes(MODEL_VAR) && model)
    ctx.say(pc.yellow(`Kept your existing ${result.skipped.join(", ")}.`));
  if (!model) ctx.say(`Set ${MODEL_VAR} in ${path} before you run the app.`);
  await alignConfig(ctx, io, p);
  if (await rememberProvider(io, p))
    ctx.say("The chat box still shows a Mock badge. Run `npx speeq upgrade` to refresh it.");
  return { saved: names.includes(keyName), ...(model ? { model } : {}), names };
}

/** Keep `.speeq/setup.json` in step with the provider that now has a key, so `upgrade` regenerates the right chat box. */
async function rememberProvider(
  io: { fs: ProjectFs; prefix: string },
  p: ProviderEntry,
): Promise<boolean> {
  const path = setupPath(io.prefix);
  const text = await io.fs.read(path);
  if (text === undefined) return false;
  try {
    const doc = JSON.parse(text) as Record<string, unknown>;
    if (doc.provider === p.id) return false;
    await io.fs.write(
      path,
      `${JSON.stringify({ ...doc, provider: p.id }, null, 2)}
`,
    );
    return doc.provider === "mock";
  } catch {
    return false; // an unreadable setup file is left alone
  }
}

/** Make sure `.env.local` cannot be committed. */
async function ensureIgnored(fs: ProjectFs, prefix: string) {
  const path = `${prefix}.gitignore`;
  const text = (await fs.read(path)) ?? "";
  if (ignoresEnvLocal(text)) return;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = text === "" || text.endsWith("\n") ? "" : nl;
  await fs.write(path, `${text}${lead}# speeq: local secrets${nl}.env*.local${nl}`);
}

/** `speeq.config.ts` is the developer's file: only change its provider with a yes, and keep a copy. */
async function alignConfig(ctx: Ctx, io: { fs: ProjectFs; prefix: string }, p: ProviderEntry) {
  const path = `${io.prefix}speeq.config.ts`;
  const text = await io.fs.read(path);
  if (text === undefined || configProviderState(text, p) !== "mismatch") return;
  ctx.say(
    pc.yellow(
      `${path} uses a different provider than ${p.label.split(" (")[0]}, so the key would not be used.`,
    ),
  );
  const next = switchProvider(text, p);
  if ("reason" in next) {
    ctx.say(
      `speeq could not change it safely (${next.reason}). Use this instead:\n  llm: ${p.expression}`,
    );
    return;
  }
  const prompts = ctx.env.prompts;
  if (
    !prompts ||
    !(await prompts.confirm(
      `Switch the model provider in ${path} to ${p.label.split(" (")[0]}? A copy is kept in .speeq/backups.`,
      true,
    ))
  ) {
    ctx.say(`Left as is. To switch by hand use:\n  llm: ${p.expression}`);
    return;
  }
  await io.fs.write(`${io.prefix}.speeq/backups/speeq.config.before-connect.ts`, text);
  await io.fs.write(path, next.text);
  ctx.say(pc.green(`Updated ${path}.`));
}

/** `speeq connect`: add a model key to this app, checked and saved from the terminal. */
export async function connect(ctx: Ctx): Promise<number> {
  const prompts = ctx.env.prompts;
  if (!ctx.interactive || !prompts)
    throw new CliExit(
      EXIT.usage,
      "speeq connect needs a terminal: it asks for your key without showing it. Without one, put the key in .env.local yourself.",
      "usage",
    );
  const root = projectRoot(ctx);
  const fs = nodeFs(root);
  const prefix = ctx.flags.app ? `${ctx.flags.app.replace(/\/+$/, "")}/` : "";
  const setup = await readSetup(fs, prefix);
  const wanted =
    ctx.flags.provider ?? (setup && setup.provider !== "mock" ? setup.provider : undefined);
  if (wanted && !PROVIDERS.some((x) => x.id === wanted))
    throw new CliExit(EXIT.usage, `Unknown provider "${wanted}".`, "usage");
  const providerId =
    wanted ??
    (await prompts.select(
      "Language model",
      PROVIDERS.filter((x) => x.needsKey).map((x) => ({
        value: x.id,
        label: x.label,
        hint: x.note,
      })),
    ));
  const result = await runConnect(ctx, { fs, prefix, providerId });
  if (result.saved)
    ctx.say(`\nRestart your dev server so it reads ${prefix}.env.local, then open your app.`);
  return ctx.finish(EXIT.ok, {
    provider: providerId,
    saved: result.saved,
    ...(result.model ? { model: result.model } : {}),
    names: result.names,
  });
}
