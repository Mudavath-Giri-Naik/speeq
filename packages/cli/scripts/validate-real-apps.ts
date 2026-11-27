/**
 * Phase 1 validation on real external Next.js apps (task 018).
 *
 * For each pinned app: fetch the revision into a cache, copy it to a temporary directory, count what the
 * app contains with an independent file-system baseline (no compiler involved), run the compiler and the
 * CLI (`scan`, `init`, repeated `init`, `verify`, `rollback`), and write measured results to
 * `docs/maintainers/real-app-results.json`. Upstream is never modified; its tree hash is checked at the end.
 *
 *   pnpm --filter @speeq/cli validate:real [app-id ...]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "@speeq/compiler";
import type { Manifest } from "@speeq/core/manifest";
import { nodeFs, setDecision, writeDecisions } from "@speeq/integrate";
import { run } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const list = JSON.parse(readFileSync(join(repoRoot, "fixtures/real-apps.json"), "utf8")) as {
  apps: { id: string; repo: string; rev: string }[];
};
const cache = process.env.SPEEQ_REAL_APPS_CACHE ?? join(tmpdir(), "speeq-real-apps");
const only = process.argv.slice(2);
const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", "coverage"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

async function files(dir: string, base = dir, skipSpeeq = false): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    const rel = relative(base, full).split("\\").join("/");
    if (e.isSymbolicLink() || SKIP.has(e.name)) continue;
    if (skipSpeeq && rel === ".speeq/backups") continue;
    if (e.isDirectory()) out.push(...(await files(full, base, skipSpeeq)));
    else out.push(rel);
  }
  return out.sort();
}
async function treeHash(dir: string, skipSpeeq = false) {
  const h = createHash("sha256");
  for (const f of await files(dir, dir, skipSpeeq)) {
    h.update(f);
    h.update(await readFile(join(dir, f)));
  }
  return h.digest("hex");
}
function fetchApp(app: { id: string; repo: string; rev: string }) {
  const dir = join(cache, app.id);
  if (!existsSync(join(dir, ".git"))) {
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["remote", "add", "origin", app.repo], { cwd: dir });
    execFileSync("git", ["fetch", "-q", "--depth", "1", "origin", app.rev], { cwd: dir });
    execFileSync("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dir });
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
  if (head !== app.rev) throw new Error(`${app.id}: cache is at ${head}, expected ${app.rev}`);
  return dir;
}
function licence(dir: string) {
  for (const n of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"]) {
    if (!existsSync(join(dir, n))) continue;
    const text = readFileSync(join(dir, n), "utf8");
    const first = text.trim().split(/\r?\n/)[0] ?? "";
    const spdx = /MIT License/i.test(text)
      ? "MIT"
      : /Apache License/i.test(text)
        ? "Apache-2.0"
        : /BSD/i.test(text)
          ? "BSD"
          : "unknown";
    return { file: n, firstLine: first, spdx };
  }
  return { file: null, firstLine: "", spdx: "none" };
}
/** Same shape for `[slug]`, `:slug` and catch-alls so the baseline and the compiler can be compared. */
function canon(p: string) {
  return p
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "{...?}")
    .replace(/\[\.\.\.[^\]]+\]/g, "{...}")
    .replace(/\[[^\]]+\]/g, "{}")
    .replace(/\/$/, "")
    .replace(/^$/, "/");
}
const USE_SERVER = /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(['"])use server\1/;
/** What the app contains, counted without the compiler. */
async function baseline(dir: string) {
  const all = await files(dir);
  const routes = new Set<string>();
  const endpoints = new Set<string>();
  const actions = new Set<string>();
  const routeFilesWithoutMethod: string[] = [];
  for (const f of all) {
    const m = /^((?:src\/)?app)\/(.*)$/.exec(f);
    if (m?.[2] !== undefined) {
      const rest = m[2];
      const parts = rest.split("/");
      const name = parts.pop() ?? "";
      const skip = parts.some((s) => s.startsWith("@") || /^\(\.+\)/.test(s));
      const path = `/${parts.filter((s) => !/^\(.*\)$/.test(s)).join("/")}`;
      if (!skip && /^page\.(tsx|jsx|ts|js)$/.test(name)) routes.add(canon(path));
      if (!skip && /^route\.(ts|js|tsx|jsx)$/.test(name)) {
        const text = await readFile(join(dir, f), "utf8");
        const before = endpoints.size;
        for (const meth of METHODS) {
          const re = new RegExp(
            `export\\s+(?:async\\s+)?function\\s+${meth}\\b|export\\s+(?:const|let|var)\\s+${meth}\\b`,
          );
          if (re.test(text)) endpoints.add(`${meth} ${canon(path)}`);
        }
        if (endpoints.size === before) routeFilesWithoutMethod.push(f);
      }
    }
    if (/\.(ts|tsx|js|jsx)$/.test(f)) {
      const text = await readFile(join(dir, f), "utf8");
      if (!USE_SERVER.test(text)) continue;
      for (const x of text.matchAll(
        /export\s+async\s+function\s+(\w+)|export\s+const\s+(\w+)\s*=\s*async/g,
      ))
        actions.add(`${f}#${x[1] ?? x[2]}`);
    }
  }
  return { files: all.length, routes, endpoints, actions, routeFilesWithoutMethod };
}
function compare(base: Set<string>, found: Set<string>) {
  const matched = [...base].filter((x) => found.has(x));
  const missing = [...base].filter((x) => !found.has(x));
  const extra = [...found].filter((x) => !base.has(x));
  return {
    baseline: base.size,
    found: found.size,
    matched: matched.length,
    recall: base.size ? matched.length / base.size : null,
    precision: found.size ? matched.length / found.size : null,
    missing: missing.slice(0, 12),
    extra: extra.slice(0, 12),
  };
}
async function cli(args: string[], cwd: string) {
  let out = "";
  const t = performance.now();
  const code = await run([...args, "--json", "--cwd", cwd], {
    cwd,
    env: { CI: "1" },
    stdout: { write: (s) => (out += s) },
    stderr: { write: () => undefined },
    isTTY: false,
  });
  const ms = Math.round(performance.now() - t);
  return { code, ms, json: JSON.parse(out.trim()) as Record<string, unknown> };
}

async function validate(app: { id: string; repo: string; rev: string }) {
  const upstream = fetchApp(app);
  const before = await treeHash(upstream);
  const result = await validateCopy(app);
  if ((await treeHash(upstream)) !== before) throw new Error(`${app.id}: upstream copy changed`);
  return result;
}
async function validateCopy(app: { id: string; repo: string; rev: string }) {
  const upstream = fetchApp(app);
  const work = await mkdtemp(join(tmpdir(), `speeq-real-${app.id}-`));
  try {
    await cp(upstream, work, {
      recursive: true,
      filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s),
    });
    const lic = licence(work);
    if (!["MIT", "Apache-2.0", "BSD"].includes(lic.spdx))
      return {
        id: app.id,
        rev: app.rev,
        repo: app.repo,
        license: lic,
        status: "licence-not-accepted",
      };
    const base = await baseline(work);
    const t0 = performance.now();
    const result = await scan({ root: work });
    const scanMs = Math.round(performance.now() - t0);
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    if (result.status !== "ok")
      return {
        id: app.id,
        rev: app.rev,
        repo: app.repo,
        license: lic,
        status: result.status,
        files: base.files,
      };
    const m: Manifest = result.manifest;
    const routes = new Set(
      m.capabilities.flatMap((c) => (c.kind === "route" ? [canon(c.path)] : [])),
    );
    const endpoints = new Set(
      m.capabilities.flatMap((c) =>
        c.kind === "endpoint" ? c.methods.map((x) => `${x} ${canon(c.path)}`) : [],
      ),
    );
    const actions = new Set(
      m.capabilities.flatMap((c) =>
        c.kind === "function" && c.export.isServerAction
          ? [`${c.export.file}#${c.export.name}`]
          : [],
      ),
    );
    const byKind: Record<string, number> = {};
    for (const c of m.capabilities) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    const bySupport: Record<string, number> = {};
    for (const c of m.capabilities) bySupport[c.support] = (bySupport[c.support] ?? 0) + 1;
    const diagnostics: Record<string, number> = {};
    for (const d of m.diagnostics) diagnostics[d.code] = (diagnostics[d.code] ?? 0) + 1;

    // Approve every route and up to 12 functions or endpoints (read access, authenticated) to exercise the generator.
    let decisions: ReturnType<typeof setDecision> | undefined;
    let approved = 0;
    let fnLeft = 12;
    for (const c of m.capabilities) {
      try {
        if (c.kind === "route" && c.dynamic !== "catch-all" && c.dynamic !== "optional-catch-all") {
          decisions = setDecision(decisions, m, c.id, "enable");
          approved++;
        } else if ((c.kind === "function" || c.kind === "endpoint") && fnLeft > 0) {
          decisions = setDecision(decisions, m, c.id, "enable", {
            access: "read",
            auth: { requirement: "authenticated" },
          });
          fnLeft--;
          approved++;
        }
      } catch {
        // unsupported or credential-handling capabilities cannot be approved: that is the point
      }
    }
    const appDir = result.project.app?.dir ?? ".";
    const prefix = appDir === "." ? "" : `${appDir}/`;
    if (decisions) await writeDecisions(nodeFs(work), prefix, decisions);
    const beforeInit = await treeHash(work, true);
    const init = await cli(["init", "--ci"], work);
    const afterInit = await treeHash(work, true);
    const init2 = await cli(["init", "--ci"], work);
    const idempotent =
      (await treeHash(work, true)) === afterInit && init2.json.applied !== "applied";
    const verify = await cli(["verify"], work);
    const checks = (verify.json.checks ?? []) as {
      id: string;
      level: string;
      status: string;
      detail?: string;
    }[];
    const rollback = await cli(["rollback"], work);
    const restored = (await treeHash(work, true)) === beforeInit;
    const plan = init.json.plan as
      | { wrapped?: unknown[]; skipped?: { id: string; reason: string }[]; manual?: unknown[] }
      | undefined;
    return {
      id: app.id,
      repo: app.repo,
      rev: app.rev,
      license: lic,
      status: "ok",
      project: init.json.project,
      files: base.files,
      scanMs,
      rssMbAfterScan: rss,
      capabilities: {
        total: m.capabilities.length,
        byKind,
        bySupport,
      },
      diagnostics,
      // Route files the baseline could not read a method from (re-exports, wrappers): did the compiler say so?
      unrecognisedRouteFiles: base.routeFilesWithoutMethod.map((f) => ({
        file: f,
        compilerDiagnostics: m.diagnostics.filter((d) => d.file === f).map((d) => d.code),
        compilerEndpoints: m.capabilities.filter(
          (c) => c.kind === "endpoint" && c.source.file === f,
        ).length,
      })),
      accuracy: {
        routes: compare(base.routes, routes),
        endpoints: compare(base.endpoints, endpoints),
        serverActions: compare(base.actions, actions),
      },
      init: {
        exit: init.code,
        ms: init.ms,
        approved,
        wrapped: plan?.wrapped?.length ?? 0,
        skipped: plan?.skipped?.length ?? 0,
        skippedReasons: [...new Set((plan?.skipped ?? []).map((s) => s.reason))].slice(0, 6),
        manualSteps: plan?.manual?.length ?? 0,
      },
      repeatedInit: { exit: init2.code, ms: init2.ms, noop: idempotent },
      verify: {
        exit: verify.code,
        ms: verify.ms,
        readiness: verify.json.readiness,
        failing: checks
          .filter((c) => c.status === "fail")
          .map((c) => ({ id: c.id, detail: c.detail })),
        runtime: checks.filter((c) => c.level === "runtime").map((c) => `${c.id}:${c.status}`),
      },
      rollback: { exit: rollback.code, ms: rollback.ms, restoredTree: restored },
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const results: unknown[] = [];
for (const app of list.apps) {
  if (only.length && !only.includes(app.id)) continue;
  process.stdout.write(`${app.id} ... `);
  try {
    const r = await validate(app);
    results.push(r);
    console.log("done");
  } catch (e) {
    console.log("FAILED", e instanceof Error ? e.message : e);
    results.push({
      id: app.id,
      rev: app.rev,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
const machine = {
  os: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model.trim(),
  cores: cpus().length,
  ramGb: Math.round(totalmem() / 1073741824),
  node: process.versions.node,
};
const out = { generatedAt: new Date().toISOString().slice(0, 10), machine, apps: results };
if (!only.length)
  writeFileSync(
    join(repoRoot, "docs/maintainers/real-app-results.json"),
    `${JSON.stringify(out, null, 2)}\n`,
  );
console.log(JSON.stringify(out, null, 2));
