import {
  type Check,
  type Level,
  type LiveDb,
  liveStoreCheck,
  readSetup,
  type VerifyReport,
  verifyProject,
} from "@speeq/integrate";
import pc from "picocolors";
import { driver, scrubMongo } from "../control/mongo.js";
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
  if (ctx.flags.liveStore && !doctor) {
    const c = await liveCheck(ctx, loaded.fs, loaded.prefix, root);
    r.checks.push(c);
    if (c.status === "fail") {
      r.ok = false;
      r.levels.host = "fail";
    } else if (r.levels.host === "not-run" && c.status === "pass") r.levels.host = "pass";
  }
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
/** A variable from `.env.local`, `.env` or the process. In memory only. */
async function envValue(
  ctx: Ctx,
  fs: { read(p: string): Promise<string | undefined> },
  prefix: string,
  name: string,
) {
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const f of [".env.local", ".env"]) {
    for (const line of ((await fs.read(`${prefix}${f}`)) ?? "").split(/\r?\n/)) {
      const v = re
        .exec(line)?.[1]
        ?.trim()
        .replace(/^(["'])(.*)\1$/, "$2");
      if (v) return v;
    }
  }
  return ctx.env.env[name] || undefined;
}
/** `--live-store`: the resume round trip in the app's MongoDB, in temporary collections. */
async function liveCheck(
  ctx: Ctx,
  fs: { read(p: string): Promise<string | undefined> },
  prefix: string,
  root: string,
): Promise<Check> {
  const base = { id: "L1", level: "host" as const, title: "Conversation persistence in MongoDB" };
  const setup = await readSetup(fs as never, prefix);
  if (!setup || setup.store?.kind !== "mongodb")
    return { ...base, status: "skip", detail: "MongoDB is not the configured store." };
  const uri = await envValue(ctx, fs, prefix, "SPEEQ_MONGODB_URI");
  if (!uri)
    return {
      ...base,
      status: "fail",
      detail: "SPEEQ_MONGODB_URI is not set.",
      fix: "Run `npx speeq setup storage`.",
    };
  const mod = (await driver(root)) as unknown as
    | {
        MongoClient: {
          connect(
            u: string,
            o: object,
          ): Promise<{ db(n?: string): LiveDb; close(): Promise<void> }>;
        };
      }
    | undefined;
  if (!mod)
    return { ...base, status: "fail", detail: "The mongodb package is not installed in your app." };
  let client: { db(n?: string): LiveDb; close(): Promise<void> } | undefined;
  try {
    client = await mod.MongoClient.connect(uri, { serverSelectionTimeoutMS: 6000 });
    const db = await envValue(ctx, fs, prefix, "SPEEQ_MONGODB_DB");
    return await liveStoreCheck(setup, client.db(db || undefined));
  } catch (e) {
    return {
      ...base,
      status: "fail",
      detail: scrubMongo(e instanceof Error ? e.message : String(e), uri),
    };
  } finally {
    await client?.close().catch(() => undefined);
  }
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
