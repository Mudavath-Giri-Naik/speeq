import type { Capability, Diagnostic, Framework } from "@speeq/core/manifest";
import type { Draft } from "./capability.js";
import { diagnostic } from "./diagnostics.js";
import type { FileCtx } from "./extract/context.js";
import { endpointDrafts } from "./extract/endpoints.js";
import { filterDrafts } from "./extract/filters.js";
import { formDrafts } from "./extract/forms.js";
import { functionDrafts, inlineServerActions } from "./extract/functions.js";
import { hasUseServer } from "./extract/handler.js";
import { type AuthCall, authCalls } from "./nextjs/auth.js";
import { classify, type RouterDirs } from "./nextjs/roles.js";
import { routeDraft } from "./nextjs/routes.js";
import { existingCalls } from "./project/existing-speeq.js";
import { ModuleGraph } from "./ts/exports.js";
import { newTouched, type SourceProject, type Touched } from "./ts/project.js";

/** Everything learned from one file. Plain data, so it can be cached. */
export interface FileResult {
  capabilities: Draft<Capability>[];
  diagnostics: Diagnostic[];
  calls: AuthCall[];
  existing: { tools: number; routes: number };
}
/** Settings shared by every file in a scan. */
export interface AnalyzeEnv {
  project: SourceProject;
  graph: ModuleGraph;
  dirs: RouterDirs;
  framework: Framework;
  maxDepth: number;
}
/** Analyze one source file. Returns the result and everything that influenced it. */
export async function analyzeFile(
  file: string,
  env: AnalyzeEnv,
): Promise<{ result: FileResult; touched: Touched }> {
  const touched = newTouched();
  touched.files.add(file);
  const empty: FileResult = {
    capabilities: [],
    diagnostics: [],
    calls: [],
    existing: { tools: 0, routes: 0 },
  };
  const parsed = await env.project.source(file);
  if (!parsed) return { result: empty, touched };
  if (!parsed.sf)
    return { result: { ...empty, diagnostics: [diagnostic("SQ0260", file)] }, touched };
  const sf = parsed.sf;
  const role = classify(file, env.dirs);
  const ctx: FileCtx = {
    file,
    sf,
    project: env.project,
    graph: env.graph,
    touched,
    maxDepth: env.maxDepth,
    diags: [],
    framework: env.framework,
    ...(role ? { role } : {}),
  };
  const capabilities: Draft<Capability>[] = [];
  if (role?.role === "skip" && role.diag) ctx.diags.push(diagnostic(role.diag, file));
  if (role?.role === "page") capabilities.push(routeDraft(role, file, sf));
  if (role?.role === "route-handler" || role?.role === "api")
    capabilities.push(...(await endpointDrafts(ctx, role)));
  if (hasUseServer(sf) || sf.text.includes("@speeq"))
    capabilities.push(...(await functionDrafts(ctx)));
  inlineServerActions(ctx);
  capabilities.push(...(await formDrafts(ctx)));
  capabilities.push(...(await filterDrafts(ctx)));
  const calls = authCalls(sf);
  const existing =
    sf.text.includes("defineTool") || sf.text.includes("defineRoute")
      ? existingCalls(sf)
      : { tools: 0, routes: 0 };
  return {
    result: { capabilities, diagnostics: ctx.diags, calls, existing },
    touched,
  };
}
export { ModuleGraph };
