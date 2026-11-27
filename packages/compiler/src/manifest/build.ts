import {
  type Capability,
  type Diagnostic,
  type Framework,
  type Manifest,
  parseManifest,
  type RouteCapability,
} from "@speeq/core/manifest";
import type { Draft } from "../capability.js";
import { diagnostic } from "../diagnostics.js";
import { type AuthCall, type Middleware, observeAuth } from "../nextjs/auth.js";
import { ToolError } from "../tool-error.js";
import { fingerprintOf } from "./fingerprint-of.js";

/** Version string stamped into every manifest. Changes with the extraction logic. */
export const GENERATOR_VERSION = "0.0.0-compiler.1";
/** Inputs to manifest assembly. */
export interface BuildInput {
  project: Manifest["project"];
  drafts: Draft<Capability>[];
  /** Auth helper calls seen in each file. */
  calls: ReadonlyMap<string, readonly AuthCall[]>;
  middleware: readonly Middleware[];
  diagnostics: Diagnostic[];
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function pathOf(c: Draft<Capability>, routes: ReadonlyMap<string, Draft<Capability>>) {
  if (c.kind === "route" || c.kind === "endpoint") return c.path;
  if ((c.kind === "form" || c.kind === "filter-set") && c.routeId) {
    const r = routes.get(c.routeId);
    if (r?.kind === "route") return r.path;
  }
  return undefined;
}
/** Assemble, link, fingerprint, sort and validate a manifest. Deterministic: no times or absolute paths. */
export function buildManifest(input: BuildInput): Manifest {
  const diags = [...input.diagnostics];
  const byId = new Map<string, Draft<Capability>>();
  for (const d of [...input.drafts].sort((a, b) => compare(a.source.file, b.source.file))) {
    const prior = byId.get(d.id);
    if (prior) {
      if (d.kind === "route") diags.push(diagnostic("SQ0142", d.source.file, d.source.line));
      continue;
    }
    byId.set(d.id, d);
  }
  const routes = new Map([...byId].filter(([, c]) => c.kind === "route"));
  const links: [string, string][] = [];
  for (const c of byId.values()) {
    if ((c.kind === "form" || c.kind === "filter-set") && c.routeId) {
      if (routes.has(c.routeId)) links.push([c.id, c.routeId]);
      else delete c.routeId;
    }
    if (c.kind === "form" && c.actionRef) {
      if (byId.get(c.actionRef)?.kind === "function") links.push([c.id, c.actionRef]);
      else delete c.actionRef;
    }
    if (c.kind === "filter-set" && c.routeId) {
      const r = routes.get(c.routeId) as Draft<RouteCapability> | undefined;
      if (r)
        r.queryParams = c.parameters.map((p) => ({
          name: p.name,
          ...(p.schema ? { schema: p.schema } : {}),
        }));
    }
  }
  const related = new Map<string, Set<string>>();
  for (const [a, b] of links) {
    (related.get(a) ?? related.set(a, new Set()).get(a))?.add(b);
    (related.get(b) ?? related.set(b, new Set()).get(b))?.add(a);
  }
  const capabilities: Capability[] = [];
  for (const c of byId.values()) {
    const auth = observeAuth(
      c.source.file,
      input.calls.get(c.source.file) ?? [],
      input.middleware,
      pathOf(c, routes),
    );
    const withAuth = { ...c, auth, related: [...(related.get(c.id) ?? [])].sort(compare) };
    capabilities.push({ ...withAuth, fingerprint: fingerprintOf(withAuth) } as Capability);
  }
  capabilities.sort((a, b) => compare(a.id, b.id));
  const seen = new Set<string>();
  const diagnostics = diags
    .filter((d) => {
      const key = `${d.file}\0${d.line}\0${d.code}\0${d.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        compare(a.file ?? "", b.file ?? "") ||
        (a.line ?? 0) - (b.line ?? 0) ||
        compare(a.code, b.code),
    );
  const manifest: Manifest = {
    manifestVersion: 1,
    generator: { name: "speeq", version: GENERATOR_VERSION },
    project: input.project,
    capabilities,
    diagnostics,
  };
  try {
    return parseManifest(manifest);
  } catch {
    throw new ToolError("SQ0010");
  }
}
/** Which router a manifest's primary framework is. */
export function primaryFramework(routers: readonly ("app" | "pages")[]): Framework | "unknown" {
  return routers.includes("app")
    ? "nextjs-app"
    : routers.includes("pages")
      ? "nextjs-pages"
      : "unknown";
}
