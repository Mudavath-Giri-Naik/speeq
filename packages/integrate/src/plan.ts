import { reconcile } from "@speeq/compiler";
import { formFillActionName } from "@speeq/core";
import type {
  Capability,
  CapabilityDecision,
  DecisionsFile,
  EndpointCapability,
  FunctionCapability,
  Manifest,
  RouteCapability,
} from "@speeq/core/manifest";
import { defineFormFill } from "@speeq/server";
import { manifestPath } from "./decisions.js";
import type { ProjectFs } from "./fsx.js";
import { snake, uniqueName } from "./names.js";
import { type Ownership, ownership, seal } from "./owned.js";
import { FEATURES, provider as findProvider, PROVIDERS } from "./registry.js";
import {
  type FormSpec,
  imp,
  layoutSnippet,
  type RouteSpec,
  renderConfig,
  renderHandler,
  renderRoutes,
  renderTools,
  renderUi,
  type ToolSpec,
} from "./render.js";
import { renderObject, renderZod } from "./schema.js";

/** Versions the engine may add to the host. Exact, from a fixed allow-list. */
export const ZOD_VERSION = "4.6.7";

/** Inputs that are not in the manifest. */
export interface PlanOptions {
  /** Repo-relative app directory with trailing slash, or `""`. */
  prefix: string;
  /** Repo-relative App Router directory (`apps/web/app`, `src/app`...), if the app has one. */
  appRouterDir?: string;
  /** Exact version of the `speeq` package to add. */
  speeqVersion: string;
  providerId?: string;
  featureIds?: readonly string[];
}
/** One file operation in a plan. */
export interface PlannedChange {
  path: string;
  action: "create" | "update" | "delete" | "keep";
  ownership: Ownership;
  /** New content for create and update. */
  content?: string;
  /** Current content for update and delete. */
  before?: string;
  reason?: string;
  /** An owned file was edited by hand; it is never written. */
  conflict?: boolean;
}
/** Everything a run would do. Building a plan writes nothing. */
export interface IntegrationPlan {
  prefix: string;
  changes: PlannedChange[];
  wrapped: { id: string; tool: string }[];
  /** The approved tools as rendered, for verification. Not part of the JSON summary. */
  toolSpecs: ToolSpec[];
  /** The approved forms as rendered into `ui.ts`, for verification. */
  forms: FormSpec[];
  skipped: { id: string; reason: string }[];
  stale: string[];
  pending: string[];
  manual: { title: string; snippet: string }[];
  dependencies: { name: string; version: string }[];
  env: { name: string; note: string }[];
  conflicts: string[];
}

const WRAPPABLE = new Set(["route", "endpoint", "function"]);
const SPLIT = /\[(\.\.\.)?([A-Za-z_][A-Za-z0-9_]*)\]/g;

function routeId(path: string, taken: Set<string>) {
  const stem = path
    .slice(1)
    .replace(/[:*?+]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const base = path === "/" ? "home" : stem || "route";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}
function checkName(name: string | undefined): string | undefined {
  return name && /^[a-zA-Z0-9_-]{1,64}$/.test(name) ? name : undefined;
}
function authOf(
  c: Capability,
  d: CapabilityDecision | undefined,
): { roles?: string[] } | undefined | "missing" {
  const req = d?.auth?.requirement;
  if (req === "authenticated") return {};
  if (req === "roles") return d?.auth?.roles?.length ? { roles: d.auth.roles } : "missing";
  if (req === "public") return undefined;
  const nonPublic =
    c.auth.observed === "present" ||
    c.sensitivity === "personal" ||
    c.sensitivity === "financial" ||
    c.sensitivity === "admin";
  return nonPublic ? "missing" : undefined;
}
function strip(s: string) {
  return s.replace(/\p{Cc}/gu, " ").slice(0, 300);
}
function routeSpec(
  c: RouteCapability,
  id: string,
  d: CapabilityDecision | undefined,
): RouteSpec | string {
  if (c.dynamic === "catch-all" || c.dynamic === "optional-catch-all")
    return "Catch-all routes cannot be navigated by id; add the path to your own routes.";
  const fields = [
    ...c.pathParams.map((name) => ({ name, required: true })),
    ...c.queryParams.map((p) => ({ name: p.name, required: false, schema: p.schema })),
  ];
  const path = c.pathPattern;
  if (!path.startsWith("/") || /[*?+()]/.test(path))
    return "The route pattern is not a plain path.";
  let params: string | undefined;
  if (fields.length) {
    const r = renderObject(fields);
    if (!r.ok) return r.reason;
    params = r.code;
  }
  const description = d?.description ?? c.description;
  return {
    id,
    path,
    title: d?.title ?? c.title,
    ...(description ? { description: strip(description) } : {}),
    ...(params ? { params } : {}),
  };
}
function functionSpec(
  c: FunctionCapability,
  d: CapabilityDecision | undefined,
  name: string,
): ToolSpec | string {
  if (c.input?.schema.type !== "object" && c.input?.source !== "none")
    return "The input is not an object schema.";
  let input = "z.object({})";
  if (c.input && c.input.source !== "none") {
    const r = renderZod(c.input.schema);
    if (!r.ok) return r.reason;
    input = r.code;
  }
  if (!/^(?:default|[A-Za-z_$][\w$]*)$/.test(c.export.name))
    return "The export name is not an identifier.";
  return base(c, d, name, input, {
    kind: "function",
    file: c.export.file,
    exportName: c.export.name,
  });
}
function endpointSpec(
  c: EndpointCapability,
  d: CapabilityDecision | undefined,
  name: string,
): ToolSpec | string {
  const [method, ...rest] = c.methods;
  if (!method || rest.length) return "The endpoint does not have exactly one method.";
  if (method === "HEAD" || method === "OPTIONS") return `${method} endpoints are not bound.`;
  if (/\[\.\.\./.test(c.path)) return "Catch-all endpoints are not bound.";
  const params: string[] = [];
  const path = c.path.replace(SPLIT, (_m, _dots, p: string) => {
    params.push(p);
    return `:${p}`;
  });
  if (/[[\]]/.test(path)) return "The endpoint path is not plain.";
  const q = c.input?.query?.properties ?? {};
  const b = c.input?.body?.properties ?? {};
  if (
    (c.input?.query && c.input.query.type !== "object") ||
    (c.input?.body && c.input.body.type !== "object")
  )
    return "The endpoint input is not an object schema.";
  if (method === "GET" && c.input?.body) return "A GET endpoint cannot have a body.";
  const fields = [
    ...params.map((name) => ({ name, required: true, schema: undefined })),
    ...Object.entries(q).map(([name, schema]) => ({
      name,
      required: !!c.input?.query?.required?.includes(name),
      schema,
    })),
    ...Object.entries(b).map(([name, schema]) => ({
      name,
      required: !!c.input?.body?.required?.includes(name),
      schema,
    })),
  ];
  if (new Set(fields.map((f) => f.name)).size !== fields.length)
    return "Parameter names repeat across path, query and body.";
  const r = renderObject(fields);
  if (!r.ok) return r.reason;
  return base(c, d, name, r.code, {
    kind: "endpoint",
    method,
    path,
    query: Object.keys(q),
    forwardAuth: d?.forwardAuth === true,
  });
}
function base(
  c: FunctionCapability | EndpointCapability,
  d: CapabilityDecision | undefined,
  name: string,
  input: string,
  call: ToolSpec["call"],
): ToolSpec | string {
  const access = c.access === "unknown" ? d?.access : c.access;
  if (!access) return "Access is unknown and the decision does not set it.";
  const auth = authOf(c, d);
  if (auth === "missing")
    return "Needs an auth requirement in its decision (public, authenticated or roles).";
  const title = d?.title ?? c.title;
  return {
    name,
    description: strip(d?.description ?? c.description ?? title),
    summary: `Run ${title.slice(0, 60)}?`,
    write: access === "write",
    noConfirm: access === "write" && d?.confirm === false,
    input,
    ...(auth ? { auth } : {}),
    ...(d?.timeoutMs ? { timeoutMs: d.timeoutMs } : {}),
    call,
  };
}
async function readJson(fs: ProjectFs, path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await fs.read(path);
    const v = text === undefined ? undefined : JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
/** Marker-owned file: written when missing or owned and different; conflict when hand-edited. */
function owned(path: string, current: string | undefined, body: string): PlannedChange {
  const content = seal(body);
  const state = ownership(current);
  if (state === "edited")
    return {
      path,
      action: "keep",
      ownership: state,
      conflict: true,
      reason: "Edited by hand; speeq will not overwrite it.",
    };
  if (state === "foreign")
    return {
      path,
      action: "keep",
      ownership: state,
      reason: "Not owned by speeq (no marker); left alone.",
    };
  if (current === content) return { path, action: "keep", ownership: state };
  return state === "missing"
    ? { path, action: "create", ownership: state, content }
    : {
        path,
        action: "update",
        ownership: state,
        content,
        ...(current !== undefined ? { before: current } : {}),
      };
}

/** Reconciliation plus the lists the CLI reports: capabilities waiting for review and stale approvals. */
export function reviewState(manifest: Manifest, decisions: DecisionsFile | undefined) {
  const r = reconcile(manifest, decisions, () => ({
    binding: "bound",
    verification: "unverified",
  }));
  const wrappable = (id: string) => WRAPPABLE.has(id.slice(0, id.indexOf(":")));
  const pending = r.entries
    .filter(
      (e) =>
        wrappable(e.id) && !e.decision && e.status.support !== "unsupported" && !e.status.blocked,
    )
    .map((e) => e.id);
  // Forms are never "pending" (most are not meant for the assistant), but an approved form that changed is stale.
  return { ...r, pending, stale: r.stale.filter((id) => wrappable(id) || id.startsWith("form:")) };
}
/** Build the plan for one project. Pure with respect to the file system: it only reads. */
export async function buildPlan(input: {
  manifest: Manifest;
  decisions?: DecisionsFile | undefined;
  fs: ProjectFs;
  options: PlanOptions;
}): Promise<IntegrationPlan> {
  const { manifest, decisions, fs, options } = input;
  const prefix = options.prefix;
  const r = reviewState(manifest, decisions);
  const status = new Map(r.entries.map((e) => [e.id, e]));
  const toolNames = new Set<string>();
  const routeIds = new Set<string>();
  const tools: ToolSpec[] = [];
  const routes: RouteSpec[] = [];
  const forms: FormSpec[] = [];
  const filterSets: { id: string; routeId?: string }[] = [];
  const wrapped: IntegrationPlan["wrapped"] = [];
  const skipped: IntegrationPlan["skipped"] = [];
  const generated = `${prefix}.speeq/generated`;

  for (const c of manifest.capabilities) {
    const e = status.get(c.id);
    const decision = e?.decision;
    const s = e?.status;
    if (!s) continue;
    if (c.kind === "form") {
      if (!s.executable) {
        if (decision?.review === "approved" && s.blocked)
          skipped.push({ id: c.id, reason: `Blocked: ${s.blocked.reason}.` });
        continue;
      }
      const spec = { id: c.id, title: strip(decision?.title ?? c.title), fields: c.fields };
      try {
        defineFormFill(spec);
      } catch {
        skipped.push({ id: c.id, reason: "No field of this form can be filled." });
        continue;
      }
      forms.push(spec);
      wrapped.push({ id: c.id, tool: formFillActionName(c.id) });
      continue;
    }
    if (c.kind === "filter-set") {
      if (s.executable) filterSets.push({ id: c.id, ...(c.routeId ? { routeId: c.routeId } : {}) });
      continue;
    }
    if (!WRAPPABLE.has(c.kind)) continue;
    if (!s.executable) {
      if (
        decision?.review === "approved" &&
        s.freshness === "current" &&
        !s.blocked &&
        c.access === "unknown" &&
        !decision.access
      )
        skipped.push({ id: c.id, reason: "Access is unknown and the decision does not set it." });
      if (s.blocked && decision?.review === "approved")
        skipped.push({ id: c.id, reason: `Blocked: ${s.blocked.reason}.` });
      continue;
    }
    let spec: ToolSpec | RouteSpec | string;
    if (c.kind === "route") {
      spec = routeSpec(c, routeId(c.pathPattern, routeIds), decision);
      if (typeof spec !== "string") routeIds.add(spec.id);
    } else if (c.kind === "function" || c.kind === "endpoint") {
      const explicit = checkName(decision?.name);
      if (decision?.name && !explicit) {
        skipped.push({ id: c.id, reason: "The decision name is not a valid tool name." });
        continue;
      }
      const stem =
        c.kind === "function" ? snake(c.export.name) : snake(`${c.methods[0] ?? ""} ${c.path}`);
      const name = uniqueName(explicit ?? stem, toolNames);
      spec =
        c.kind === "function" ? functionSpec(c, decision, name) : endpointSpec(c, decision, name);
      if (typeof spec === "string") toolNames.delete(name);
    } else continue;
    if (typeof spec === "string") {
      skipped.push({ id: c.id, reason: spec });
      continue;
    }
    if ("call" in spec) tools.push(spec);
    else routes.push(spec);
    wrapped.push({ id: c.id, tool: "call" in spec ? spec.name : spec.id });
  }

  // Filters are applied by navigation: the compiler already folds a filter-set's parameters into its
  // route's query parameters, and `navigate` validates them. They need an approved route.
  for (const f of filterSets) {
    const through = wrapped.find((w) => w.id === f.routeId);
    if (through) wrapped.push({ id: f.id, tool: through.tool });
    else
      skipped.push({
        id: f.id,
        reason: `Approve ${f.routeId ?? "its route"} so these filters can be applied by navigation.`,
      });
  }

  const { stale, pending } = r;
  const changes: PlannedChange[] = [];
  const read = (p: string) => fs.read(p);

  const mPath = manifestPath(prefix);
  const mText = `${JSON.stringify(manifest, null, 2)}\n`;
  const mCurrent = await read(mPath);
  changes.push(
    mCurrent === mText
      ? { path: mPath, action: "keep", ownership: "owned" }
      : mCurrent === undefined
        ? { path: mPath, action: "create", ownership: "missing", content: mText }
        : { path: mPath, action: "update", ownership: "owned", content: mText, before: mCurrent },
  );
  const toolsPath = `${generated}/tools.ts`;
  const routesPath = `${generated}/routes.ts`;
  changes.push(owned(toolsPath, await read(toolsPath), renderTools(tools, toolsPath)));
  changes.push(owned(routesPath, await read(routesPath), renderRoutes(routes)));
  const uiPath = `${generated}/ui.ts`;
  const uiCurrent = await read(uiPath);
  if (forms.length || uiCurrent !== undefined)
    changes.push(owned(uiPath, uiCurrent, renderUi(forms)));

  const manual: IntegrationPlan["manual"] = [];
  const configPath = `${prefix}speeq.config.ts`;
  let configExports = true;
  let configFile = configPath;
  let existing: string | undefined;
  for (const ext of ["ts", "js", "mjs"]) {
    const p = `${prefix}speeq.config.${ext}`;
    const text = await read(p);
    if (text !== undefined) {
      existing = text;
      configFile = p;
      break;
    }
  }
  const prov = findProvider(options.providerId ?? "mock") ?? PROVIDERS[0];
  if (!prov) throw new Error("No providers registered");
  const features = FEATURES.filter((f) =>
    options.featureIds ? options.featureIds.includes(f.id) : f.defaultOn,
  );
  if (existing === undefined) {
    changes.push({
      path: configPath,
      action: "create",
      ownership: "missing",
      content: renderConfig({
        provider: prov,
        features,
        generatedDir: generated,
        configFile: configPath,
        ui: forms.length > 0,
      }),
    });
  } else {
    changes.push({
      path: configFile,
      action: "keep",
      ownership: "foreign",
      reason: "Exists; speeq never overwrites your config.",
    });
    configExports = /export\s+(?:const|let|var)\s+speeq\b/.test(existing);
    if (forms.length && !/generated\/ui/.test(existing))
      manual.push({
        title: `Pass the generated UI actions in ${configFile}`,
        snippet: `import { uiActions } from "./.speeq/generated/ui";\n// then pass uiActions to createSpeeq({ ..., uiActions })`,
      });
    if (!/\.speeq\/generated\//.test(existing))
      manual.push({
        title: `Use the generated tools and routes in ${configFile}`,
        snippet: `import { routes } from "./.speeq/generated/routes";\nimport { tools } from "./.speeq/generated/tools";\n// then pass routes and tools to createSpeeq({ ..., routes, tools })`,
      });
  }

  if (options.appRouterDir !== undefined && manifest.project.framework === "nextjs-app") {
    const handlerPath = `${options.appRouterDir}/api/speeq/[[...speeq]]/route.ts`;
    const current = await read(handlerPath);
    const hasHandler =
      current === undefined &&
      (await read(`${options.appRouterDir}/api/speeq/[[...speeq]]/route.js`)) !== undefined;
    if (hasHandler) {
      changes.push({
        path: handlerPath,
        action: "keep",
        ownership: "foreign",
        reason: "A route.js handler exists.",
      });
    } else if (!configExports && current === undefined) {
      manual.push({
        title: "Create the speeq route handler",
        snippet: [
          `// ${handlerPath}`,
          imp("{ createNextHandler }", "speeq/server/next"),
          imp("{ speeq }", "<your speeq instance>"),
          'export const runtime = "nodejs";',
          "export const { GET, POST, OPTIONS } = createNextHandler(speeq);",
        ].join("\n"),
      });
    } else {
      changes.push(owned(handlerPath, current, renderHandler(handlerPath, configFile)));
    }
    const layoutDone = await layoutHasProvider(fs, options.appRouterDir);
    if (!layoutDone)
      manual.push({ title: "Add the provider to your root layout", snippet: layoutSnippet() });
  } else {
    manual.push({
      title: "Mount the speeq handler",
      snippet:
        "Only the App Router is wired automatically. Mount `speeq.handler` (a web-standard handler) at /api/speeq.",
    });
  }

  for (const f of forms)
    manual.push({
      title: `Bind the form ${f.id} in the client component that renders it`,
      snippet: [
        imp("{ useSpeeqForm }", "speeq/react"),
        `// fields the assistant may fill: ${f.fields.map((x) => x.name).join(", ")}`,
        `useSpeeqForm(${JSON.stringify(f.id)}, {`,
        "  setValues: (values) => { /* write the draft values into your form */ },",
        "  isDirty: (name) => false, // return true when the visitor edited this field",
        "});",
      ].join("\n"),
    });

  const pkg = await readJson(fs, `${prefix}package.json`);
  const declared = new Set([
    ...Object.keys((pkg?.dependencies as object | undefined) ?? {}),
    ...Object.keys((pkg?.devDependencies as object | undefined) ?? {}),
  ]);
  const dependencies: IntegrationPlan["dependencies"] = [];
  if (!declared.has("speeq")) dependencies.push({ name: "speeq", version: options.speeqVersion });
  if (!declared.has("zod")) dependencies.push({ name: "zod", version: ZOD_VERSION });

  const env = new Map<string, string>([
    ["SPEEQ_SECRET", "32+ random characters; signs session tokens (required in production)"],
  ]);
  if (tools.some((t) => t.call.kind === "endpoint"))
    env.set("SPEEQ_BASE_URL", "Origin of this app for bound endpoints, e.g. https://example.com");
  for (const v of [...prov.env, ...features.flatMap((f) => f.env)]) env.set(v.name, v.note);

  const conflicts = changes.filter((c) => c.conflict).map((c) => c.path);
  return {
    prefix,
    changes,
    wrapped,
    toolSpecs: tools,
    forms,
    skipped,
    stale,
    pending,
    manual,
    dependencies,
    env: [...env].map(([name, note]) => ({ name, note })),
    conflicts,
  };
}
async function layoutHasProvider(fs: ProjectFs, appRouterDir: string): Promise<boolean> {
  for (const ext of ["tsx", "jsx", "js", "ts"]) {
    const text = await fs.read(`${appRouterDir}/layout.${ext}`);
    if (text !== undefined) return /SpeeqProvider|<Speeq[\s>]/.test(text);
  }
  return false;
}
/** True when applying the plan would change nothing. */
export function isEmptyPlan(plan: IntegrationPlan): boolean {
  return plan.changes.every((c) => c.action === "keep" && !c.conflict);
}
