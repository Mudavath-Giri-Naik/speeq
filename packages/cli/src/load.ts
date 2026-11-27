import { isAbsolute, resolve } from "node:path";
import { scan } from "@speeq/compiler";
import type { Manifest } from "@speeq/core/manifest";
import { IntegrateError, nodeFs, ownership, type ProjectFs, readDecisions } from "@speeq/integrate";
import { CliExit, type Ctx, EXIT, type Loaded } from "./types.js";
import { SPEEQ_PACKAGE_VERSION } from "./version.js";

/** Absolute project directory. */
export function projectRoot(ctx: Ctx): string {
  const dir = ctx.flags.cwd;
  return dir ? (isAbsolute(dir) ? dir : resolve(ctx.env.cwd, dir)) : ctx.env.cwd;
}
/** Scan the project and read the developer's decisions. Throws `CliExit` when it cannot continue. */
export async function load(ctx: Ctx): Promise<Loaded> {
  const root = projectRoot(ctx);
  let appDir = ctx.flags.app;
  let result = await scan({ root, ...(appDir ? { appDir } : {}) });
  if (result.status === "needs-selection" && ctx.interactive && ctx.env.prompts) {
    const picked = await ctx.env.prompts.select(
      "Which app should speeq integrate?",
      result.candidates.map((c) => ({ value: c.dir, label: c.dir, hint: c.name ?? "" })),
    );
    appDir = picked;
    result = await scan({ root, appDir });
  }
  if (result.status === "needs-selection")
    throw new CliExit(
      EXIT.usage,
      `Several apps found (${result.candidates.map((c) => c.dir).join(", ")}). Pass --app <dir>.`,
      "needs-selection",
    );
  if (result.status === "unsupported")
    throw new CliExit(EXIT.unsupported, result.reason, "unsupported");
  const fs = nodeFs(root);
  const dir = result.project.app?.dir ?? ".";
  const prefix = dir === "." ? "" : `${dir}/`;
  let decisions: Loaded["decisions"];
  try {
    decisions = await readDecisions(fs, prefix);
  } catch (e) {
    if (e instanceof IntegrateError) throw new CliExit(EXIT.failure, e.message, e.code);
    throw e;
  }
  const app = result.project.app;
  const manifest = await withoutOwnFiles(fs, result.manifest);
  return {
    manifest,
    fs,
    prefix,
    decisions,
    diagnostics: manifest.diagnostics.length,
    options: {
      prefix,
      ...(app?.appRouterDir ? { appRouterDir: app.appRouterDir } : {}),
      speeqVersion: SPEEQ_PACKAGE_VERSION,
      ...(ctx.flags.provider ? { providerId: ctx.flags.provider } : {}),
    },
  };
}

/**
 * The scanner reports speeq's own generated handler as a skipped host handler (SQ0171). That
 * would change the manifest after every first apply, so diagnostics about files that carry the
 * generated marker are left out. Otherwise a second run would not be an empty plan.
 */
async function withoutOwnFiles(fs: ProjectFs, manifest: Manifest): Promise<Manifest> {
  const own = new Set<string>();
  for (const d of manifest.diagnostics) {
    if (d.code !== "SQ0171" || !d.file || own.has(d.file)) continue;
    if (ownership(await fs.read(d.file)) !== "foreign") own.add(d.file);
  }
  if (own.size === 0) return manifest;
  return {
    ...manifest,
    diagnostics: manifest.diagnostics.filter(
      (d) => !(d.code === "SQ0171" && d.file && own.has(d.file)),
    ),
  };
}
