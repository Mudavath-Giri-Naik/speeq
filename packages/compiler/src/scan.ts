import type { Capability, Diagnostic, Manifest } from "@speeq/core/manifest";
import { type AnalyzeEnv, analyzeFile, type FileResult } from "./analyze.js";
import {
  ANALYZER_VERSION,
  type CachedFile,
  type Extraction,
  type ScanCache,
  validExtraction,
} from "./cache.js";
import type { Draft } from "./capability.js";
import { diagnostic } from "./diagnostics.js";
import { openRepoFs } from "./fs/repo-fs.js";
import { buildManifest, primaryFramework } from "./manifest/build.js";
import { type AuthCall, type Middleware, readMiddleware } from "./nextjs/auth.js";
import { compileMatcher } from "./nextjs/matcher.js";
import type { RouterDirs } from "./nextjs/roles.js";
import { type ExistingSpeeq, existingSpeeq } from "./project/existing-speeq.js";
import type { DetectedIntegration } from "./project/integrations.js";
import { type AppCandidate, inspectProject, type ProjectInfo } from "./project/workspace.js";
import { ToolError } from "./tool-error.js";
import { ModuleGraph } from "./ts/exports.js";
import { SourceProject } from "./ts/project.js";

/** Options for {@link scan}. */
export interface ScanOptions {
  /** Directory to scan: the repository root or any directory inside it. */
  root: string;
  /** Repo-relative app directory. Required when several applications exist. */
  appDir?: string;
  cache?: ScanCache;
  signal?: AbortSignal;
  extraIgnore?: string[];
  limits?: {
    maxFileBytes?: number;
    maxFiles?: number;
    maxImportDepth?: number;
    deadlineMs?: number;
  };
}
/** Counters for one scan. Timing lives here and never in the manifest. */
export interface ScanStats {
  filesListed: number;
  filesParsed: number;
  filesFromCache: number;
  importsResolved: number;
  durationMs: number;
  peakRssBytes?: number;
  /** Source files analyzed again in this scan (cache misses). */
  reanalyzed: string[];
}
/** Outcome of a scan. A manifest is never fabricated. */
export type ScanResult =
  | {
      status: "ok";
      manifest: Manifest;
      project: ProjectInfo;
      integrations: DetectedIntegration[];
      existingSpeeq: ExistingSpeeq;
      cache: ScanCache;
      stats: ScanStats;
    }
  | {
      status: "needs-selection";
      candidates: AppCandidate[];
      diagnostics: Diagnostic[];
      project: ProjectInfo;
    }
  | { status: "unsupported"; reason: string; diagnostics: Diagnostic[]; project: ProjectInfo };

const SOURCE = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/;
const MIDDLEWARE = /(?:^|\/)(?:src\/)?(?:middleware|proxy)\.(?:tsx?|jsx?|mjs|mts)$/;

function nextMajor(range: string | undefined) {
  const m = /(\d+)/.exec(range ?? "");
  return m ? Number(m[1]) : undefined;
}
/** Discover capabilities in a Next.js repository. Reads only; never runs repository code. */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const started = performance.now();
  const lim = options.limits ?? {};
  const signals = [
    options.signal,
    lim.deadlineMs ? AbortSignal.timeout(lim.deadlineMs) : undefined,
  ];
  const live = signals.filter((s): s is AbortSignal => !!s);
  const signal = live.length ? AbortSignal.any(live) : undefined;
  const fs = await openRepoFs({
    root: options.root,
    ...(lim.maxFileBytes ? { maxFileBytes: lim.maxFileBytes } : {}),
    ...(lim.maxFiles ? { maxFiles: lim.maxFiles } : {}),
    ...(options.extraIgnore ? { extraIgnore: options.extraIgnore } : {}),
    ...(signal ? { signal } : {}),
  });
  try {
    const files = await fs.listFiles();
    const info = await inspectProject(fs, files, options.appDir);
    const { project } = info;
    const unsupported = (reason: string, code: "SQ0102" | "SQ0103", file: string): ScanResult => ({
      status: "unsupported",
      reason,
      diagnostics: [diagnostic(code, file), ...fs.diagnostics],
      project,
    });
    if (!info.chosen) {
      if (options.appDir === undefined && info.apps.length > 1)
        return {
          status: "needs-selection",
          candidates: info.apps,
          diagnostics: [diagnostic("SQ0101", "package.json")],
          project,
        };
      return unsupported(
        "No Next.js application was found.",
        "SQ0102",
        files.includes("package.json") ? "package.json" : (files[0] ?? "package.json"),
      );
    }
    const major = nextMajor(info.chosen.nextVersion);
    const pkgFile = info.prefix + "package.json";
    if (major !== undefined && major < 13)
      return unsupported("Next.js older than version 13 is not supported.", "SQ0103", pkgFile);
    const app = project.app;
    const dirs: RouterDirs = {
      ...(app?.appRouterDir ? { appRouterDir: app.appRouterDir } : {}),
      ...(app?.pagesDir ? { pagesDir: app.pagesDir } : {}),
    };
    const routers = app?.routers ?? [];
    const sources = info.appFiles.filter(
      (f) =>
        SOURCE.test(f) &&
        !/\.d\.[cm]?ts$/.test(f) &&
        !/\.(?:test|spec)\.[a-z]+$/.test(f) &&
        !f.startsWith(`${info.prefix}.speeq/`),
    );
    const sp = new SourceProject(fs, files, info.config?.options);
    const env: AnalyzeEnv = {
      project: sp,
      graph: new ModuleGraph(sp),
      dirs,
      framework: routers.includes("app") ? "nextjs-app" : "nextjs-pages",
      maxDepth: lim.maxImportDepth ?? 8,
    };
    // Filesystem notes about files outside the chosen application are noise for this scan.
    const diags: Diagnostic[] = fs.diagnostics.filter(
      (d) => !d.file || d.file.startsWith(info.prefix),
    );
    if (info.invalidConfig) diags.push(diagnostic("SQ0104", info.invalidConfig));
    if (info.config?.dropped.length && project.tsconfig)
      diags.push(
        diagnostic(
          "SQ0104",
          project.tsconfig.path,
          undefined,
          `parent config not found: ${info.config.dropped.join(", ")}`,
        ),
      );
    const middleware: Middleware[] = [];
    for (const f of sources.filter((f) => MIDDLEWARE.test(f) && f.startsWith(info.prefix))) {
      const rel = f.slice(info.prefix.length);
      if (!/^(?:src\/)?(?:middleware|proxy)\./.test(rel)) continue;
      const parsed = await sp.source(f);
      if (!parsed?.sf) continue;
      const mw = readMiddleware(f, parsed.sf);
      middleware.push(mw);
      if (mw.matcherDynamic || (mw.matchers ?? []).some((m) => !compileMatcher(m)))
        diags.push(diagnostic("SQ0160", f));
    }
    const previous =
      options.cache &&
      options.cache.analyzerVersion === ANALYZER_VERSION &&
      options.cache.appDir === info.chosen.dir
        ? options.cache
        : undefined;
    const next: Record<string, CachedFile> = {};
    const drafts: Draft<Capability>[] = [];
    const calls = new Map<string, readonly AuthCall[]>();
    const counts: { tools: number; routes: number }[] = [];
    const reanalyzed: string[] = [];
    let fromCache = 0,
      resolved = 0;
    for (const file of sources) {
      let ex: Extraction | undefined = await validExtraction(file, previous?.files[file], sp);
      if (ex) fromCache++;
      else {
        const { result, touched } = await analyzeFile(file, env);
        const deps: Record<string, string> = {};
        for (const d of [...touched.files].sort()) {
          const sha = await sp.sha(d);
          if (sha !== undefined) deps[d] = sha;
        }
        ex = { result, deps, resolutions: [...touched.resolutions] };
        reanalyzed.push(file);
      }
      const sha = await sp.sha(file);
      if (sha !== undefined)
        next[file] = { sha256: sha, imports: Object.keys(ex.deps), extraction: ex };
      resolved += ex.resolutions.length;
      const r: FileResult = structuredClone(ex.result);
      drafts.push(...r.capabilities);
      diags.push(...r.diagnostics);
      if (r.calls.length) calls.set(file, r.calls);
      counts.push(r.existing);
      if (r.existing.tools || r.existing.routes)
        diags.push(
          diagnostic(
            "SQ0170",
            file,
            undefined,
            `${r.existing.tools} tools and ${r.existing.routes} routes already defined`,
          ),
        );
    }
    const manifest = buildManifest({
      project: {
        root: ".",
        framework: primaryFramework(routers),
        packageManager: project.packageManager,
        ...(info.chosen.dir !== "." ? { appDir: info.chosen.dir } : {}),
        language: project.language,
      },
      drafts,
      calls,
      middleware,
      diagnostics: diags,
    });
    const installed = info.integrations.some((i) => i.categories.includes("speeq"));
    const stats: ScanStats = {
      filesListed: files.length,
      filesParsed: sp.parseCount,
      filesFromCache: fromCache,
      importsResolved: resolved,
      durationMs: Math.round(performance.now() - started),
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      reanalyzed,
    };
    return {
      status: "ok",
      manifest,
      project,
      integrations: info.integrations,
      existingSpeeq: existingSpeeq(files, info.prefix, installed, counts),
      cache: { analyzerVersion: ANALYZER_VERSION, appDir: info.chosen.dir, files: next },
      stats,
    };
  } catch (e) {
    if (e instanceof ToolError && e.code === "SQ0006") {
      return {
        status: "unsupported",
        reason: "The scan deadline was reached.",
        diagnostics: [diagnostic("SQ0006")],
        project: {
          packageManager: "unknown",
          workspace: { kind: "none", root: ".", apps: [] },
          language: "javascript",
        },
      };
    }
    throw e;
  }
}
