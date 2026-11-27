import { type Check, type Level, type VerifyReport, verifyProject } from "@speeq/integrate";
import pc from "picocolors";
import { load, projectRoot } from "../load.js";
import { type Ctx, EXIT } from "../types.js";

const TITLES: Record<Level, string> = {
  static: "Static (files, manifest, decisions, config, env, dependencies)",
  runtime: "Runtime (mock model, generated tools, no host code run)",
  host: "Host (the app's own commands)",
};
const MARK = {
  pass: pc.green("pass"),
  fail: pc.red("fail"),
  warn: pc.yellow("warn"),
  skip: pc.dim("skip"),
};

function nodeCheck(): Check {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const ok = major > 22 || (major === 22 && minor >= 12);
  return {
    id: "D1",
    level: "static",
    title: "Node.js is 22.12 or newer",
    status: ok ? "pass" : "fail",
    detail: `Running ${process.versions.node}`,
    ...(ok ? {} : { fix: "Install Node.js 22.12 or newer for the speeq CLI." }),
  };
}
function show(ctx: Ctx, report: VerifyReport) {
  for (const level of ["static", "runtime", "host"] as const) {
    const state = report.levels[level];
    ctx.say(
      `\n${pc.bold(TITLES[level])}: ${state === "not-run" ? pc.dim("not run") : MARK[state]}`,
    );
    for (const c of report.checks.filter((x) => x.level === level)) {
      ctx.say(`  ${MARK[c.status]} ${c.title}${c.detail ? pc.dim(`  ${c.detail}`) : ""}`);
      if (c.fix && (c.status === "fail" || c.status === "warn"))
        ctx.say(`       ${pc.dim(`fix: ${c.fix}`)}`);
    }
  }
  ctx.say(
    pc.dim(
      "\nNot verified here: a live model provider and production readiness. `speeq verify` never calls a real model.",
    ),
  );
}
async function report(ctx: Ctx, levels: Level[], doctor: boolean): Promise<number> {
  const loaded = await load(ctx);
  const root = projectRoot(ctx);
  const exec = ctx.env.exec;
  const r = await verifyProject({
    fs: loaded.fs,
    manifest: loaded.manifest,
    options: loaded.options,
    levels,
    env: ctx.env.env,
    ...(ctx.flags.runHost && exec ? { run: (c: string, a: string[]) => exec(c, a, root) } : {}),
  });
  if (doctor) {
    r.checks.unshift(nodeCheck());
    r.ok = r.ok && r.checks[0]?.status !== "fail";
    if (r.checks[0]?.status === "fail") r.levels.static = "fail";
  }
  if (!ctx.flags.json) show(ctx, r);
  const exit = !r.ok ? EXIT.failure : r.reviewPending ? EXIT.needsReview : EXIT.ok;
  return ctx.finish(exit, {
    readiness: r.levels,
    checks: r.checks,
    reviewPending: r.reviewPending,
  });
}
/** `speeq verify`: static and runtime checks; `--run-host` adds the app's own type check. */
export function verifyCommand(ctx: Ctx): Promise<number> {
  return report(
    ctx,
    ctx.flags.runHost ? ["static", "runtime", "host"] : ["static", "runtime"],
    false,
  );
}
/** `speeq doctor`: environment and static checks only. Nothing runs. */
export function doctorCommand(ctx: Ctx): Promise<number> {
  return report(ctx, ["static"], true);
}
