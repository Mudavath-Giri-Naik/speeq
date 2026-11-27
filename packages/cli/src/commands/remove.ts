import { join } from "node:path";
import {
  applyRemoval,
  nodeFs,
  type ProjectFs,
  planRemoval,
  type RemovalPlan,
  type RemovalSelection,
} from "@speeq/integrate";
import pc from "picocolors";
import { projectRoot } from "../load.js";
import { CliExit, type Ctx, EXIT } from "../types.js";
import { uiOf } from "../ui.js";

type Item = "files" | "taken" | "edited" | "layout" | "config" | "dir" | "env" | "keys" | "pkg";
const LOCKS: [string, string, string[]][] = [
  ["pnpm-lock.yaml", "pnpm", ["remove", "speeq"]],
  ["yarn.lock", "yarn", ["remove", "speeq"]],
  ["bun.lock", "bun", ["remove", "speeq"]],
  ["bun.lockb", "bun", ["remove", "speeq"]],
  ["package-lock.json", "npm", ["uninstall", "speeq"]],
];

/** The package manager command that removes `speeq`, or `undefined` when package.json does not list it. */
async function uninstallCommand(fs: ProjectFs, prefix: string) {
  const pkg = await fs.read(`${prefix}package.json`);
  if (!pkg || !/"speeq"\s*:/.test(pkg)) return undefined;
  for (const dir of [prefix, ""])
    for (const [lock, command, args] of LOCKS)
      if ((await fs.read(`${dir}${lock}`)) !== undefined) return { command, args };
  return { command: "npm", args: ["uninstall", "speeq"] };
}

/** Everything the plan found, as one-line labels for the review. */
function describe(plan: RemovalPlan, hasPkg: boolean) {
  const by = (state: string) => plan.files.filter((f) => f.state === state).map((f) => f.path);
  const envFiles = (k: "speeq" | "shared") =>
    plan.env.filter((e) => e[k].length).map((e) => `${e[k].join(", ")} in ${e.file}`);
  const rows: { id: Item; label: string; hint: string; on: boolean; count: number }[] = [
    {
      id: "files",
      label: "Generated files you have not edited",
      hint: by("owned").join(", "),
      on: true,
      count: by("owned").length,
    },
    {
      id: "layout",
      label: "The chat box in your layout",
      hint: plan.layouts.map((l) => l.path).join(", "),
      on: true,
      count: plan.layouts.length,
    },
    {
      id: "config",
      label: "speeq.config.ts",
      hint: plan.config?.header ? "still as speeq created it" : "you changed it",
      on: plan.config?.header === true,
      count: plan.config ? 1 : 0,
    },
    {
      id: "dir",
      label: "The .speeq folder",
      hint: "decisions, manifest, generated files, backups",
      on: true,
      count: plan.speeqDir ? 1 : 0,
    },
    {
      id: "env",
      label: "speeq's variable names in your env files",
      hint: envFiles("speeq").join("; "),
      on: true,
      count: plan.env.reduce((n, e) => n + e.speeq.length, 0),
    },
    {
      id: "edited",
      label: "Generated files you edited",
      hint: by("edited").join(", "),
      on: false,
      count: by("edited").length,
    },
    {
      id: "taken",
      label: "Files you took over (marker deleted)",
      hint: by("taken").join(", "),
      on: false,
      count: by("taken").length,
    },
    {
      id: "keys",
      label: "Provider keys",
      hint: `${envFiles("shared").join("; ")} (your app may use these)`,
      on: false,
      count: plan.env.reduce((n, e) => n + e.shared.length, 0),
    },
    {
      id: "pkg",
      label: "Uninstall the speeq package",
      hint: "also leaves zod, which your app may use",
      on: hasPkg,
      count: hasPkg ? 1 : 0,
    },
  ];
  return rows.filter((r) => r.count > 0);
}

/** `speeq remove` (alias `uninstall`): take speeq out of the project, only what speeq added. */
export async function removeCommand(ctx: Ctx): Promise<number> {
  const ui = uiOf(ctx);
  const prompts = ctx.env.prompts;
  const interactive = ctx.interactive && prompts !== undefined;
  if (!interactive && !ctx.flags.yes && !ctx.flags.dryRun && !ctx.flags.json)
    throw new CliExit(
      EXIT.usage,
      "speeq remove changes many files. Run it in a terminal, or pass --yes to remove the defaults, or --dry-run to see the list.",
      "usage",
    );
  const root = projectRoot(ctx);
  const fs = nodeFs(root);
  const prefix = ctx.flags.app ? `${ctx.flags.app.replace(/\/+$/, "")}/` : "";
  const plan = await planRemoval(fs, prefix);
  const uninstall = await uninstallCommand(fs, prefix);
  const rows = describe(plan, uninstall !== undefined);
  if (rows.length === 0) {
    ui.info("speeq is not set up in this folder. Nothing to remove.");
    return ctx.finish(EXIT.ok, { removed: [] });
  }
  if (interactive) ui.intro("Remove speeq from this project");
  ui.note(
    rows
      .map((r) => `${pc.cyan("•")} ${r.label}${r.hint ? pc.dim(`\n    ${r.hint}`) : ""}`)
      .join("\n"),
    "speeq added these",
  );
  let chosen = new Set<Item>(rows.filter((r) => r.on).map((r) => r.id));
  if (!interactive && chosen.size === 0) {
    ui.info("Nothing to remove by default. Run it in a terminal to choose the rest.");
    return ctx.finish(EXIT.ok, { removed: [] });
  }
  if (interactive && prompts) {
    ui.info(pc.dim("Tip: commit first, so git can bring anything back."));
    chosen = new Set(
      await prompts.multiselect(
        "What should be removed?",
        rows.map((r) => ({ value: r.id, label: r.label, hint: r.hint })),
        [...chosen],
      ),
    );
    if (
      chosen.size === 0 ||
      !(await prompts.confirm("Remove the selected items now? This cannot be undone.", false))
    ) {
      ui.outro("Nothing was removed.");
      return ctx.finish(EXIT.ok, { removed: [] });
    }
  } else chosen.delete("pkg"); // a package manager is never run without a terminal and an answer
  const state = (s: string) => plan.files.filter((f) => f.state === s).map((f) => f.path);
  const pick: RemovalSelection = {
    files: [
      ...(chosen.has("files") ? state("owned") : []),
      ...(chosen.has("edited") ? state("edited") : []),
      ...(chosen.has("taken") ? state("taken") : []),
    ],
    layouts: chosen.has("layout") ? plan.layouts.map((l) => l.path) : [],
    config: chosen.has("config"),
    speeqDir: chosen.has("dir"),
    env: plan.env
      .map((e) => ({
        file: e.file,
        names: [...(chosen.has("env") ? e.speeq : []), ...(chosen.has("keys") ? e.shared : [])],
      }))
      .filter((e) => e.names.length > 0),
  };
  if (ctx.flags.dryRun) {
    ui.info("Dry run: nothing was changed.");
    return ctx.finish(EXIT.ok, { dryRun: true, wouldRemove: [...chosen] });
  }
  const done = await applyRemoval(fs, prefix, plan, pick);
  for (const p of done) ui.ok(`Removed ${p}`);
  let packageRemoved = false;
  if (chosen.has("pkg") && uninstall) {
    if (ctx.env.exec) {
      const busy = ui.busy(`${uninstall.command} ${uninstall.args.join(" ")}`);
      packageRemoved =
        (await ctx.env.exec(uninstall.command, uninstall.args, join(root, prefix))) === 0;
      busy.stop(
        packageRemoved ? "The speeq package is uninstalled" : "Could not uninstall the package",
        packageRemoved,
      );
    }
    if (!packageRemoved)
      ui.warn(`Run this yourself: ${uninstall.command} ${uninstall.args.join(" ")}`);
  }
  ui.outro(
    `${pc.green("speeq is removed.")} Restart your dev server. You can set it up again any time with npx speeq init.`,
  );
  return ctx.finish(EXIT.ok, { removed: done, packageRemoved });
}
