import { FEATURES, type IntegrationPlan, PROVIDERS, reviewState, VOICES } from "@speeq/integrate";
import pc from "picocolors";
import { load } from "../load.js";
import { reviewPending } from "../review.js";
import { installDependencies, reviewExit, showManual, showPlan, sync } from "../sync.js";
import { CliExit, type Ctx, EXIT, type Loaded, planSummary } from "../types.js";
import { type Choices, runWizard } from "../wizard.js";
import { applyChoices, initialChoices, setupCommand } from "./setup.js";

function projectDoc(l: Loaded) {
  const p = l.manifest.project;
  return {
    framework: p.framework,
    packageManager: p.packageManager,
    appDir: l.prefix ? l.prefix.slice(0, -1) : ".",
    language: p.language,
  };
}
const LANGUAGE_CHOICES = [
  { value: "en-IN", label: "English" },
  { value: "te-IN", label: "Telugu" },
  { value: "hi-IN", label: "Hindi" },
];
/** Provider, voice, languages, chat box and env choices: prompts in a terminal, flags and defaults otherwise. */
async function chooseSetup(ctx: Ctx, loaded: Loaded) {
  const prompts = ctx.env.prompts;
  const o = loaded.options;
  const ask = ctx.interactive && prompts !== undefined;
  if (ctx.flags.provider && !PROVIDERS.some((p) => p.id === ctx.flags.provider))
    throw new CliExit(EXIT.usage, `Unknown provider "${ctx.flags.provider}".`, "usage");
  if (ctx.flags.voice && !VOICES.some((v) => v.id === ctx.flags.voice))
    throw new CliExit(EXIT.usage, `Unknown voice "${ctx.flags.voice}".`, "usage");
  o.providerId =
    ctx.flags.provider ??
    (ask
      ? await prompts.select(
          "Language model",
          PROVIDERS.map((p) => ({ value: p.id, label: p.label, hint: p.note })),
        )
      : "mock");
  const voice =
    ctx.flags.voice ??
    (ask
      ? await prompts.select(
          "Voice",
          VOICES.map((v) => ({ value: v.id, label: v.label, hint: v.note })),
        )
      : "browser");
  o.voice = voice as NonNullable<typeof o.voice>;
  const tags = ctx.flags.languages
    ? ctx.flags.languages
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : ask
      ? await prompts.multiselect("Languages", LANGUAGE_CHOICES, ["en-IN"])
      : ["en-IN"];
  o.languages = tags.length ? tags : ["en-IN"];
  o.ui =
    !ctx.flags.noUi &&
    (ask && !ctx.flags.yes
      ? await prompts.confirm("Add the chat box to your layout?", true)
      : true);
  o.env =
    !ctx.flags.noEnv &&
    (ask && !ctx.flags.yes
      ? await prompts.confirm("Write the needed variable names into .env.local?", true)
      : true);
  o.remember = true;
}
/** What to do next, in plain words. */
function showNextSteps(ctx: Ctx, loaded: Loaded, plan: IntegrationPlan, saved: string[]) {
  const o = loaded.options;
  const needsKey = PROVIDERS.find((p) => p.id === (o.providerId ?? "mock"))?.needsKey === true;
  const names = plan.env.map((e) => e.name).filter((n) => n !== "SPEEQ_SECRET");
  const pm = loaded.manifest.project.packageManager;
  const dev = pm === "yarn" ? "yarn dev" : `${pm === "unknown" ? "npm" : pm} run dev`;
  const lines = ["", pc.bold("Next steps")];
  const keySaved = saved.some((n) => n.endsWith("_API_KEY"));
  if (keySaved)
    lines.push(
      `  1. Your keys and models are saved in .env.local${saved.includes("SPEEQ_LLM_MODEL") ? "" : " (set SPEEQ_LLM_MODEL there too)"}`,
      `  2. Run ${pc.cyan(dev)} and open your app${o.ui ? ": the chat box is bottom-right" : ""}`,
    );
  else if (needsKey && o.env)
    lines.push(`  1. Open .env.local, paste a value for: ${names.join(", ")}`, "  2. Save it");
  else if (needsKey) lines.push(`  1. Set these environment variables: ${names.join(", ")}`);
  else lines.push("  1. (Mock mode needs no key: the assistant gives canned replies.)");
  if (!keySaved)
    lines.push(
      `  ${needsKey ? 3 : 2}. Run ${pc.cyan(dev)} and open your app${o.ui ? ": the chat box is bottom-right" : ""}`,
    );
  if (needsKey && !keySaved)
    lines.push("  Or let speeq check the key and pick a working model for you: npx speeq setup");
  if (!needsKey)
    lines.push(
      "  To connect a real model, voice or Sarvam later: npx speeq setup (it checks your keys for you).",
    );
  ctx.say(lines.join("\n"));
}
/** `speeq init`: scan, review, integrate. */
export async function init(ctx: Ctx): Promise<number> {
  if (ctx.interactive) ctx.say(pc.dim("Scanning your app..."));
  const loaded = await load(ctx);
  ctx.say(
    pc.bold(
      `Found ${loaded.manifest.capabilities.length} capabilities in ${projectDoc(loaded).appDir}`,
    ),
  );
  const prompts = ctx.env.prompts;
  const first = !loaded.options.remember;
  let choices: Choices | undefined;
  const flagged = Boolean(ctx.flags.provider || ctx.flags.voice || ctx.flags.languages);
  if (first && ctx.interactive && prompts && !flagged) {
    choices = await runWizard(
      ctx,
      { fs: loaded.fs, prefix: loaded.prefix },
      initialChoices(undefined),
      "first",
    );
    if (!choices) throw new CliExit(EXIT.failure, "Cancelled.", "cancelled");
    const o = loaded.options;
    o.providerId = choices.provider;
    o.voice = choices.voice;
    o.languages = choices.languages;
    o.ui = choices.ui;
    o.env = !ctx.flags.noEnv;
    o.remember = true;
  } else if (first) await chooseSetup(ctx, loaded);
  else if (ctx.interactive)
    ctx.say(pc.dim("Already set up. Change the model, voice or keys any time: npx speeq setup"));
  if (ctx.interactive && prompts) {
    loaded.options.featureIds = await prompts.multiselect(
      "Features",
      FEATURES.map((f) => ({ value: f.id, label: f.label, hint: f.note })),
      FEATURES.filter((f) => f.defaultOn).map((f) => f.id),
    );
    if (!ctx.flags.dryRun) loaded.decisions = await reviewPending(ctx, loaded);
  }
  const { plan, applied } = await sync(ctx, loaded);
  let installed: boolean | undefined;
  if (!ctx.flags.dryRun && plan.dependencies.length) {
    const wants =
      ctx.flags.install ||
      (ctx.interactive && prompts
        ? await prompts.confirm("Install missing dependencies now?", true)
        : false);
    if (wants) installed = await installDependencies(ctx, loaded, plan);
  }
  let saved: string[] = [];
  if (choices && !ctx.flags.dryRun && loaded.options.env)
    saved = (
      await applyChoices(ctx, { fs: loaded.fs, prefix: loaded.prefix }, choices, {
        regenerate: false,
      })
    ).names;
  if (!ctx.flags.json) {
    showManual(ctx, plan);
    showNextSteps(ctx, loaded, plan, saved);
  }
  return ctx.finish(reviewExit(plan), {
    project: projectDoc(loaded),
    plan: planSummary(plan),
    applied: applied?.status ?? "dry-run",
    ...(installed === undefined ? {} : { installed }),
  });
}
/** `speeq upgrade`: rescan, reconcile, regenerate owned files. Never approves anything. */
export async function upgrade(ctx: Ctx): Promise<number> {
  const loaded = await load(ctx);
  const state = reviewState(loaded.manifest, loaded.decisions);
  for (const m of state.moved)
    ctx.say(pc.yellow(`moved: ${m.from} -> ${m.to} (approve the new id to keep it)`));
  for (const id of state.orphaned)
    ctx.say(pc.yellow(`orphaned decision (capability no longer found): ${id}`));
  const { plan, applied } = await sync(ctx, loaded);
  return ctx.finish(reviewExit(plan), {
    project: projectDoc(loaded),
    plan: planSummary(plan),
    applied: applied?.status ?? "dry-run",
    reconcile: {
      stale: state.stale,
      pending: state.pending,
      moved: state.moved,
      orphaned: state.orphaned,
      invalid: state.invalidDecisions,
    },
  });
}
/** `speeq configure`: the control center. Without a terminal it reports status and plans nothing to write. */
export async function configure(ctx: Ctx): Promise<number> {
  const loaded = await load(ctx);
  const prompts = ctx.env.prompts;
  if (!ctx.interactive || !prompts) {
    const state = reviewState(loaded.manifest, loaded.decisions);
    const { plan } = await sync({ ...ctx, flags: { ...ctx.flags, dryRun: true } }, loaded);
    return ctx.finish(reviewExit(plan), {
      project: projectDoc(loaded),
      plan: planSummary(plan),
      applied: "dry-run",
      reconcile: {
        stale: state.stale,
        pending: state.pending,
        moved: state.moved,
        orphaned: state.orphaned,
        invalid: state.invalidDecisions,
      },
    });
  }
  for (;;) {
    const choice = await prompts.select("speeq control center", [
      { value: "review", label: "Review capabilities" },
      { value: "provider", label: "Model, voice, languages and keys (step by step)" },
      { value: "status", label: "Show status and pending changes" },
      { value: "apply", label: "Apply changes" },
      { value: "exit", label: "Exit" },
    ]);
    if (choice === "exit") break;
    if (choice === "review") loaded.decisions = await reviewPending(ctx, loaded);
    else if (choice === "status") {
      const plan = (await sync({ ...ctx, flags: { ...ctx.flags, dryRun: true } }, loaded)).plan;
      showManual(ctx, plan);
    } else if (choice === "provider") {
      await setupCommand(ctx);
    } else if (choice === "apply") {
      const { plan } = await sync(ctx, loaded);
      showPlan(ctx, plan);
    }
  }
  const plan = (await sync({ ...ctx, flags: { ...ctx.flags, dryRun: true } }, loaded)).plan;
  return ctx.finish(reviewExit(plan), { project: projectDoc(loaded), plan: planSummary(plan) });
}
