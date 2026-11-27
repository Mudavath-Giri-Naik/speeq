import type { DecisionsFile, Manifest } from "@speeq/core/manifest";
import { decisionsPath, IntegrateError, manifestPath, readDecisions } from "./decisions.js";
import type { ProjectFs } from "./fsx.js";
import { ownership } from "./owned.js";
import { buildPlan, type PlanOptions, reviewState } from "./plan.js";
import { runtimeChecks } from "./runtime.js";

/** Readiness levels. They are reported separately and never merged. */
export type Level = "static" | "runtime" | "host";
/** One verification result. */
export interface Check {
  id: string;
  level: Level;
  status: "pass" | "fail" | "warn" | "skip";
  title: string;
  detail?: string;
  fix?: string;
}
/** What `verify` and `doctor` return. */
export interface VerifyReport {
  speeq: 1;
  /** `not-run` when the level was not requested. */
  levels: Record<Level, "pass" | "fail" | "not-run">;
  checks: Check[];
  /** No check failed. Says nothing about levels that did not run. */
  ok: boolean;
  /** Stale or pending capabilities: the developer still has decisions to make. */
  reviewPending: boolean;
}
/** Input of {@link verifyProject}. */
export interface VerifyInput {
  fs: ProjectFs;
  manifest: Manifest;
  options: PlanOptions;
  levels: readonly Level[];
  /** Environment variables of the process (names are checked, values are never kept). */
  env: Record<string, string | undefined>;
  /** Runs a command in the project. Only called for the host level. */
  run?: (command: string, args: string[]) => Promise<number>;
}

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
async function envNames(fs: ProjectFs, prefix: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const f of ENV_FILES) {
    const text = await fs.read(`${prefix}${f}`);
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S.*)$/.exec(line);
      if (m?.[1] && !/^(['"])\1$/.test((m[2] ?? "").trim())) names.add(m[1]);
    }
  }
  return names;
}
async function staticChecks(
  i: VerifyInput,
  decisions: DecisionsFile | undefined,
  decisionsError: string | undefined,
) {
  const { fs, manifest, options } = i;
  const prefix = options.prefix;
  const out: Check[] = [];
  const add = (c: Omit<Check, "level">) => out.push({ level: "static", ...c });
  const plan = await buildPlan({ manifest, decisions, fs, options });
  const gen = `${prefix}.speeq/generated`;
  const owned: Record<string, boolean> = {};
  for (const name of ["tools", "routes"]) {
    const path = `${gen}/${name}.ts`;
    const state = ownership(await fs.read(path));
    owned[name] = state === "owned";
    const base = { id: `S1.${name}`, title: `${path} is owned and unedited` };
    if (state === "owned") add({ ...base, status: "pass" });
    else if (state === "edited")
      add({
        ...base,
        status: "fail",
        detail: "Edited by hand while the speeq marker is still on the first line.",
        fix: "Restore it, or delete the first line to take ownership of the file.",
      });
    else if (state === "foreign")
      add({
        ...base,
        status: "warn",
        detail: "The marker was removed, so the file is yours and speeq does not check it.",
      });
    else add({ ...base, status: "fail", detail: "Missing.", fix: "Run `speeq init`." });
  }
  const mChange = plan.changes.find((c) => c.path === manifestPath(prefix));
  add({
    id: "S2",
    title: "The manifest is fresh",
    status: mChange?.action === "keep" ? "pass" : "fail",
    ...(mChange?.action === "keep"
      ? {}
      : {
          detail:
            mChange?.action === "create"
              ? ".speeq/manifest.json is missing."
              : "The code changed since the last scan.",
          fix: "Run `speeq scan` (or `speeq upgrade`).",
        }),
  });
  add(
    decisionsError
      ? {
          id: "S3",
          title: "Decisions are valid",
          status: "fail",
          detail: decisionsError,
          fix: `Fix or restore ${decisionsPath(prefix)}.`,
        }
      : decisions
        ? { id: "S3", title: "Decisions are valid", status: "pass" }
        : manifest.capabilities.length
          ? {
              id: "S3",
              title: "Decisions are valid",
              status: "warn",
              detail: "No decisions file: nothing is approved yet.",
              fix: "Run `speeq init` or `speeq capabilities enable <id>`.",
            }
          : {
              id: "S3",
              title: "Decisions are valid",
              status: "pass",
              detail: "Nothing to decide.",
            },
  );
  const gens = plan.changes.filter(
    (c) => c.path === `${gen}/tools.ts` || c.path === `${gen}/routes.ts`,
  );
  const stale = gens.filter((c) => c.ownership === "owned" && c.action === "update");
  add({
    id: "S4",
    title: "Generated files match the approved capabilities",
    status: stale.length ? "fail" : "pass",
    ...(stale.length
      ? {
          detail: `Out of date: ${stale.map((c) => c.path).join(", ")}`,
          fix: "Run `speeq upgrade`.",
        }
      : {}),
  });
  const configChange = plan.changes.find((c) => /speeq\.config\.(ts|js|mjs)$/.test(c.path));
  const configText = configChange?.action === "keep" ? await fs.read(configChange.path) : undefined;
  const exportsSpeeq =
    configText !== undefined && /export\s+(?:const|let|var)\s+speeq\b/.test(configText);
  add({
    id: "S5",
    title: "The config exports `speeq`",
    status: exportsSpeeq ? "pass" : "fail",
    ...(exportsSpeeq
      ? {}
      : {
          detail:
            configText === undefined
              ? "No speeq.config file found."
              : "The config does not `export const speeq`.",
          fix: "Run `speeq init`, or export the createSpeeq(...) result as `speeq`.",
        }),
  });
  if (configText !== undefined)
    add({
      id: "S6",
      title: "The config uses the generated tools and routes",
      status:
        /\.speeq\/generated\/tools/.test(configText) &&
        /\.speeq\/generated\/routes/.test(configText)
          ? "pass"
          : "warn",
      detail: "Import `tools` and `routes` from .speeq/generated and pass them to createSpeeq.",
    });
  if (options.appRouterDir !== undefined) {
    const handler = plan.changes.find((c) => c.path.endsWith("/api/speeq/[[...speeq]]/route.ts"));
    const missingHandler =
      handler?.action === "create" ||
      (handler === undefined &&
        plan.manual.some((m) => m.title.startsWith("Create the speeq route")));
    add({
      id: "S7",
      title: "The API route handler exists",
      status: missingHandler ? "fail" : "pass",
      ...(missingHandler ? { detail: "No handler at /api/speeq.", fix: "Run `speeq init`." } : {}),
    });
    const layout = plan.manual.some((m) => m.title.includes("root layout"));
    if (layout)
      add({
        id: "S7b",
        title: "The root layout has the speeq provider",
        status: "warn",
        detail: "Add <SpeeqProvider> to your root layout (see `speeq init`).",
      });
  } else
    add({
      id: "S7",
      title: "The API route handler exists",
      status: "skip",
      detail: "Only the App Router is wired automatically.",
    });
  const have = await envNames(fs, prefix);
  const missingEnv = plan.env.map((e) => e.name).filter((n) => !i.env[n] && !have.has(n));
  add({
    id: "S8",
    title: "Environment variables are set",
    status: missingEnv.length ? "warn" : "pass",
    ...(missingEnv.length
      ? {
          detail: `Not set: ${missingEnv.join(", ")}`,
          fix: "Add them to .env.local (names only are checked).",
        }
      : {}),
  });
  add({
    id: "S9",
    title: "Dependencies are declared",
    status: plan.dependencies.length ? "fail" : "pass",
    ...(plan.dependencies.length
      ? {
          detail: `Missing: ${plan.dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}`,
          fix: "Run `speeq init --install` or add them yourself.",
        }
      : {}),
  });
  const rs = reviewState(manifest, decisions);
  const open = rs.stale.length + rs.pending.length + rs.orphaned.length + rs.moved.length;
  add({
    id: "S10",
    title: "Every discovered capability has a decision",
    status: open ? "warn" : "pass",
    ...(open
      ? {
          detail: `${rs.pending.length} waiting, ${rs.stale.length} stale, ${rs.moved.length} moved, ${rs.orphaned.length} orphaned`,
          fix: "Run `speeq capabilities list`.",
        }
      : {}),
  });
  return { checks: out, plan, owned, reviewPending: rs.stale.length + rs.pending.length > 0 };
}
async function hostCheck(i: VerifyInput): Promise<Check> {
  const base = { id: "H1", level: "host" as const, title: "The app's own type check passes" };
  if (!i.run) return { ...base, status: "skip", detail: "No command runner is available." };
  const text = await i.fs.read(`${i.options.prefix}package.json`);
  let pkg: { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object } =
    {};
  try {
    pkg = text ? JSON.parse(text) : {};
  } catch {}
  const pm = i.manifest.project.packageManager;
  const script = ["typecheck", "type-check", "tsc"].find((s) => pkg.scripts?.[s]);
  let cmd: [string, string[]] | undefined;
  if (script) cmd = [pm === "unknown" ? "npm" : pm, ["run", script]];
  else if (
    "typescript" in { ...pkg.dependencies, ...pkg.devDependencies } &&
    (await i.fs.read(`${i.options.prefix}tsconfig.json`)) !== undefined
  ) {
    const exec: Record<string, [string, string[]]> = {
      pnpm: ["pnpm", ["exec", "tsc", "--noEmit"]],
      yarn: ["yarn", ["tsc", "--noEmit"]],
      bun: ["bunx", ["tsc", "--noEmit"]],
    };
    cmd = exec[pm] ?? ["npx", ["tsc", "--noEmit"]];
  }
  if (!cmd)
    return {
      ...base,
      status: "skip",
      detail: "No typecheck script and no TypeScript setup found.",
    };
  const code = await i.run(cmd[0], cmd[1]);
  return {
    ...base,
    status: code === 0 ? "pass" : "fail",
    detail: `${cmd[0]} ${cmd[1].join(" ")} exited with ${code}`,
  };
}

/**
 * Verify an integrated project at the requested levels. Reads only: nothing is written and no
 * host code runs unless the `host` level is requested (that runs the app's own command).
 */
export async function verifyProject(input: VerifyInput): Promise<VerifyReport> {
  const { fs, options } = input;
  let decisions: DecisionsFile | undefined;
  let decisionsError: string | undefined;
  try {
    decisions = await readDecisions(fs, options.prefix);
  } catch (e) {
    if (!(e instanceof IntegrateError)) throw e;
    decisionsError = e.message;
  }
  const want = new Set(input.levels);
  const checks: Check[] = [];
  let reviewPending = false;
  const stat = await staticChecks(input, decisions, decisionsError);
  reviewPending = stat.reviewPending;
  if (want.has("static")) checks.push(...stat.checks);
  if (want.has("runtime")) {
    const gen = `${options.prefix}.speeq/generated`;
    const read = async (n: string) => {
      const text = await fs.read(`${gen}/${n}.ts`);
      return ownership(text) === "owned" ? text : undefined;
    };
    checks.push(
      ...(await runtimeChecks({
        tools: await read("tools"),
        routes: await read("routes"),
        specs: stat.plan.toolSpecs,
      })),
    );
  }
  if (want.has("host")) checks.push(await hostCheck(input));
  const level = (l: Level): VerifyReport["levels"][Level] => {
    if (!want.has(l)) return "not-run";
    const mine = checks.filter((c) => c.level === l);
    if (mine.some((c) => c.status === "fail")) return "fail";
    return mine.some((c) => c.status === "pass") ? "pass" : "not-run";
  };
  return {
    speeq: 1,
    levels: { static: level("static"), runtime: level("runtime"), host: level("host") },
    checks,
    ok: !checks.some((c) => c.status === "fail"),
    reviewPending,
  };
}
