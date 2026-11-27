import { join } from "node:path";
import {
  type ApplyResult,
  applyPlan,
  buildPlan,
  type IntegrationPlan,
  isEmptyPlan,
  renderDiff,
} from "@speeq/integrate";
import pc from "picocolors";
import { projectRoot } from "./load.js";
import { CliExit, type Ctx, EXIT, type Loaded } from "./types.js";

/** Print a plan for people. */
export function showPlan(ctx: Ctx, plan: IntegrationPlan) {
  const verb = { create: "create", update: "update", delete: "delete", keep: "keep" } as const;
  for (const c of plan.changes) {
    if (c.action === "keep" && !c.conflict && !c.reason) continue;
    const tag = c.conflict
      ? pc.red("conflict")
      : c.action === "keep"
        ? pc.dim("keep    ")
        : pc.green(verb[c.action].padEnd(8));
    ctx.say(`  ${tag} ${c.path}${c.reason ? pc.dim(`  (${c.reason})`) : ""}`);
  }
  if (plan.wrapped.length)
    ctx.say(`  wrapped ${plan.wrapped.length}: ${plan.wrapped.map((w) => w.tool).join(", ")}`);
  for (const s of plan.skipped) ctx.say(`  ${pc.yellow("skipped")} ${s.id}: ${s.reason}`);
  if (plan.stale.length)
    ctx.say(
      pc.yellow(`  stale (changed since approval, not executable): ${plan.stale.join(", ")}`),
    );
  if (plan.pending.length)
    ctx.say(
      `  ${plan.pending.length} capabilities are waiting for your review (speeq capabilities list)`,
    );
}
/** Print what the developer must do by hand. */
export function showManual(ctx: Ctx, plan: IntegrationPlan) {
  for (const m of plan.manual) ctx.say(`\n${pc.bold(m.title)}\n${m.snippet}`);
  if (plan.env.length)
    ctx.say(
      `\nEnvironment variables:\n${plan.env.map((e) => `  ${e.name}  ${pc.dim(e.note)}`).join("\n")}`,
    );
  if (plan.dependencies.length)
    ctx.say(
      `\nDependencies to add: ${plan.dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}`,
    );
}
/** The needs-review exit rule: anything stale or waiting for a decision. */
export function reviewExit(plan: IntegrationPlan): number {
  return plan.stale.length || plan.pending.length ? EXIT.needsReview : EXIT.ok;
}
/** Build the plan, preview it, and apply unless this is a dry run. Throws `CliExit` on conflict or failure. */
export async function sync(
  ctx: Ctx,
  loaded: Loaded,
): Promise<{ plan: IntegrationPlan; applied: ApplyResult | undefined }> {
  const plan = await buildPlan({
    manifest: loaded.manifest,
    decisions: loaded.decisions,
    fs: loaded.fs,
    options: loaded.options,
  });
  showPlan(ctx, plan);
  if (ctx.flags.diff) ctx.say(renderDiff(plan));
  if (ctx.flags.dryRun) return { plan, applied: undefined };
  if (ctx.interactive && !ctx.flags.yes && !isEmptyPlan(plan) && ctx.env.prompts) {
    if (!(await ctx.env.prompts.confirm("Apply these changes?", true)))
      throw new CliExit(EXIT.failure, "Cancelled.", "cancelled");
  }
  const applied = await applyPlan(loaded.fs, plan);
  if (applied.status === "conflict")
    throw new CliExit(
      EXIT.failure,
      `Edited by hand, not overwritten: ${applied.conflicts.join(", ")}. Delete the first line of a file to take ownership, or restore it.`,
      "conflict",
    );
  if (applied.status === "failed")
    throw new CliExit(
      EXIT.failure,
      `Apply failed: ${applied.reason}${applied.restored ? " (changes were undone)" : ""}.`,
      "apply-failed",
    );
  if (applied.status === "applied")
    ctx.say(
      pc.green(
        `Applied ${applied.written.length + applied.removed.length} file change(s). Undo with: speeq rollback`,
      ),
    );
  else ctx.say(pc.dim("Nothing to change."));
  return { plan, applied };
}
/** Install missing dependencies with the project's package manager. Never runs implicitly. */
export async function installDependencies(
  ctx: Ctx,
  loaded: Loaded,
  plan: IntegrationPlan,
): Promise<boolean> {
  if (!plan.dependencies.length) return true;
  const pm = loaded.manifest.project.packageManager;
  const manager = pm === "unknown" ? "npm" : pm;
  const specs = plan.dependencies.map((d) => `${d.name}@${d.version}`);
  const verb = manager === "npm" ? "install" : "add";
  const exact = manager === "npm" || manager === "pnpm" ? "--save-exact" : "--exact";
  const args = [verb, exact, "--ignore-scripts", ...specs];
  if (!ctx.env.exec || manager === "yarn") {
    ctx.say(
      "Run: " +
        manager +
        " " +
        (manager === "yarn" ? ["add", "--exact", ...specs] : args).join(" "),
    );
    return false;
  }
  ctx.say(`Installing: ${manager} ${args.join(" ")}`);
  const cwd = loaded.prefix ? join(projectRoot(ctx), loaded.prefix) : projectRoot(ctx);
  return (await ctx.env.exec(manager, args, cwd)) === 0;
}
