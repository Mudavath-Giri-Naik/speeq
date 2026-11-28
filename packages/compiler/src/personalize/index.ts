import type { Manifest } from "@speeq/core/manifest";
import type ts from "typescript";
import { openRepoFs, type RepoFs } from "../fs/repo-fs.js";
import { type Middleware, readMiddleware } from "../nextjs/auth.js";
import type { DetectedIntegration } from "../project/integrations.js";
import { inspectProject } from "../project/workspace.js";
import { SourceProject } from "../ts/project.js";
import { type AuthDiscovery, discoverAuth } from "./auth.js";
import { type BusinessFacts, discoverBusiness } from "./business.js";
import { type DataSourceCandidate, discoverDataSources, isCandidatePath } from "./sources.js";

export * from "./auth.js";
export * from "./business.js";
export * from "./sources.js";

/** What the app tells SPEEQ about who signs in, their data and the business (release 0.12). */
export interface Personalization {
  auth: AuthDiscovery;
  dataSources: DataSourceCandidate[];
  business: BusinessFacts;
}

const AUTH_HINT =
  /NextAuth|authOptions|AuthOptions|betterAuth|createServerClient|getCurrentUser|getSessionUser|currentUser|getUser|getAuthUser|requireUser|getViewer|getMe/;

const SOURCE = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/;
const MIDDLEWARE = /^(?:src\/)?(?:middleware|proxy)\.(?:tsx?|jsx?|mjs|mts)$/;

/** Options for {@link discoverPersonalization}. */
export interface PersonalizationOptions {
  /** The same root (and appDir) given to `scan`. */
  root: string;
  appDir?: string;
  /** The manifest `scan` returned for this root. */
  manifest: Manifest;
  signal?: AbortSignal;
}

/**
 * Finds the app's sign-in system, candidate customer data sources and business facts. Separate
 * from `scan` so rescans stay incremental; `speeq setup` runs it when it needs the answers. Reads
 * files as data and never runs repository code. Everything it returns is a suggestion.
 */
export async function discoverPersonalization(
  options: PersonalizationOptions,
): Promise<Personalization> {
  const fs = await openRepoFs({
    root: options.root,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const files = await fs.listFiles();
  const info = await inspectProject(fs, files, options.appDir);
  const sp = new SourceProject(fs, files, info.config?.options);
  const sources = info.appFiles.filter(
    (f) =>
      SOURCE.test(f) &&
      !/\.d\.[cm]?ts$/.test(f) &&
      !/\.(?:test|spec)\.[a-z]+$/.test(f) &&
      !f.startsWith(`${info.prefix}.speeq/`),
  );
  const middleware: Middleware[] = [];
  for (const f of sources) {
    if (!f.startsWith(info.prefix) || !MIDDLEWARE.test(f.slice(info.prefix.length))) continue;
    const parsed = await sp.source(f);
    if (parsed?.sf) middleware.push(readMiddleware(f, parsed.sf));
  }
  return discoverIn({
    fs,
    sp,
    files,
    sources,
    prefix: info.prefix,
    ...(info.project.app?.appRouterDir ? { appRouterDir: info.project.app.appRouterDir } : {}),
    integrations: info.integrations,
    middleware,
    manifest: options.manifest,
  });
}

async function discoverIn(input: {
  fs: RepoFs;
  sp: SourceProject;
  files: readonly string[];
  sources: readonly string[];
  prefix: string;
  appRouterDir?: string;
  integrations: readonly DetectedIntegration[];
  middleware: readonly Middleware[];
  manifest: Manifest;
}): Promise<Personalization> {
  const parsed = new Map<string, ts.SourceFile | undefined>();
  const list: { file: string; text: string; sf?: ts.SourceFile }[] = [];
  const parse = async (f: string) => {
    if (parsed.has(f)) return;
    const p = await input.sp.source(f);
    parsed.set(f, p?.sf);
    if (p) list.push(p);
  };
  // Parse only files that can matter, so a warm (cached) scan stays cheap.
  for (const f of input.sources) {
    const text = await input.sp.text(f);
    if (text && AUTH_HINT.test(text)) await parse(f);
  }
  const endpointFiles = new Set(
    input.manifest.capabilities.flatMap((c) =>
      c.kind === "endpoint" && c.methods.includes("GET") && isCandidatePath(c.path)
        ? [c.source.file]
        : [],
    ),
  );
  for (const f of endpointFiles) await parse(f);
  const layoutFile = input.appRouterDir
    ? ["tsx", "jsx", "ts", "js"]
        .map((x) => `${input.appRouterDir}/layout.${x}`)
        .find((f) => input.sources.includes(f))
    : undefined;
  if (layoutFile) await parse(layoutFile);
  const routes = input.manifest.capabilities.flatMap((c) => (c.kind === "route" ? [c.path] : []));
  const read = async (file: string) =>
    input.files.includes(file) ? await input.fs.readText(file).catch(() => undefined) : undefined;
  const pkgFile = `${input.prefix}package.json`;
  const pkg = await read(pkgFile);
  const readmeFile = [`${input.prefix}README.md`, "README.md", `${input.prefix}readme.md`].find(
    (f) => input.files.includes(f),
  );
  const readme = readmeFile ? await read(readmeFile) : undefined;
  const layoutSf = layoutFile ? parsed.get(layoutFile) : undefined;
  return {
    auth: discoverAuth({
      sources: list,
      integrations: input.integrations,
      middleware: input.middleware,
      routes,
    }),
    dataSources: discoverDataSources(input.manifest, parsed),
    business: discoverBusiness({
      manifest: input.manifest,
      ...(layoutFile && layoutSf ? { layout: { file: layoutFile, sf: layoutSf } } : {}),
      ...(pkg !== undefined ? { packageJson: { file: pkgFile, text: pkg } } : {}),
      ...(readmeFile && readme !== undefined ? { readme: { file: readmeFile, text: readme } } : {}),
    }),
  };
}
