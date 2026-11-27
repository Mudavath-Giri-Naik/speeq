import { FEATURES, PROVIDERS, reviewState } from "@speeq/integrate";
import pc from "picocolors";
import { load } from "../load.js";
import { reviewPending } from "../review.js";
import { installDependencies, reviewExit, showManual, showPlan, sync } from "../sync.js";
import { type Ctx, type Loaded, planSummary } from "../types.js";

function projectDoc(l: Loaded) {
  const p = l.manifest.project;
  return {
    framework: p.framework,
    packageManager: p.packageManager,
    appDir: l.prefix ? l.prefix.slice(0, -1) : ".",
    language: p.language,
  };
}
/** `speeq init`: scan, review, integrate. */
export async function init(ctx: Ctx): Promise<number> {
  const loaded = await load(ctx);
  ctx.say(
    pc.bold(
      `Found ${loaded.manifest.capabilities.length} capabilities in ${projectDoc(loaded).appDir}`,
    ),
  );
  const prompts = ctx.env.prompts;
  if (ctx.interactive && prompts) {
    if (!ctx.flags.provider)
      loaded.options.providerId = await prompts.select(
        "Language model",
        PROVIDERS.map((p) => ({ value: p.id, label: p.label, hint: p.note })),
      );
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
  if (!ctx.flags.json) showManual(ctx, plan);
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
      { value: "provider", label: "Language model (shows the config to use)" },
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
      const id = await prompts.select(
        "Provider",
        PROVIDERS.map((p) => ({ value: p.id, label: p.label, hint: p.note })),
      );
      const p = PROVIDERS.find((x) => x.id === id);
      if (p)
        ctx.say(
          `speeq.config.ts is yours, so speeq does not rewrite it. Use:\n  llm: ${p.expression}\nEnvironment: ${p.env.map((e) => e.name).join(", ") || "none"}`,
        );
    } else if (choice === "apply") {
      const { plan } = await sync(ctx, loaded);
      showPlan(ctx, plan);
    }
  }
  const plan = (await sync({ ...ctx, flags: { ...ctx.flags, dryRun: true } }, loaded)).plan;
  return ctx.finish(reviewExit(plan), { project: projectDoc(loaded), plan: planSummary(plan) });
}
