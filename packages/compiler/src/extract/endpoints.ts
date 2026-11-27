import type { EndpointCapability } from "@speeq/core/manifest";
import ts from "typescript";
import { type Draft, evidence, UNOBSERVED } from "../capability.js";
import { diagnostic } from "../diagnostics.js";
import { capabilityId } from "../ids.js";
import { docOf } from "../jsdoc.js";
import { unwrap } from "../nextjs/metadata.js";
import type { Role } from "../nextjs/roles.js";
import { sensitivityOfPath } from "../nextjs/sensitivity.js";
import { tableOf } from "../ts/exports.js";
import { lineOf, nodes } from "../ts/parse.js";
import { type FileCtx, walkFor } from "./context.js";
import { analyzeInput } from "./endpoint-input.js";
import { type FunctionLike, functionOf } from "./handler.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];

function draft(
  method: string,
  path: string,
  file: string,
  line: number,
  router: "app" | "pages",
  detector: string,
  note: string,
  r: Awaited<ReturnType<typeof analyzeInput>> | undefined,
  methods: Method[],
  description?: string,
): Draft<EndpointCapability> {
  const credentials = r?.sensitive;
  return {
    id: capabilityId("endpoint", `${method} ${path}`),
    kind: "endpoint",
    title: `${method} ${path}`.slice(0, 80),
    ...(description ? { description } : {}),
    framework: router === "app" ? "nextjs-app" : "nextjs-pages",
    source: { file, line },
    evidence: [evidence(detector, file, line, note)],
    support: r?.support ?? "needs-review",
    ...(r?.support !== "proven"
      ? { supportReason: r?.reason ?? "Handler methods could not be determined." }
      : {}),
    access: "unknown",
    sensitivity: credentials ? "credentials" : sensitivityOfPath(path),
    auth: { ...UNOBSERVED, evidence: [] },
    related: [],
    path,
    methods,
    ...(r?.input ? { input: r.input } : {}),
  };
}
/** Pages API handlers: methods only from literal `req.method` comparisons. */
function pagesMethods(fn: FunctionLike): { method: Method; line: number }[] {
  const param = fn.parameters[0];
  if (!param || !ts.isIdentifier(param.name) || !fn.body) return [];
  const req = param.name.text;
  const found = new Map<Method, number>();
  const isMethod = (e: ts.Expression) => {
    const x = unwrap(e);
    return (
      ts.isPropertyAccessExpression(x) &&
      x.name.text === "method" &&
      ts.isIdentifier(x.expression) &&
      x.expression.text === req
    );
  };
  const add = (e: ts.Expression, at: ts.Node) => {
    const x = unwrap(e);
    if (ts.isStringLiteral(x) && (METHODS as readonly string[]).includes(x.text))
      if (!found.has(x.text as Method)) found.set(x.text as Method, lineOf(at));
  };
  for (const n of nodes(fn.body)) {
    if (
      ts.isBinaryExpression(n) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(
        n.operatorToken.kind,
      )
    ) {
      if (isMethod(n.left)) add(n.right, n);
      else if (isMethod(n.right)) add(n.left, n);
    } else if (ts.isSwitchStatement(n) && isMethod(n.expression)) {
      for (const c of n.caseBlock.clauses) if (ts.isCaseClause(c)) add(c.expression, c);
    }
  }
  return METHODS.filter((m) => found.has(m)).map((m) => ({
    method: m,
    line: found.get(m) as number,
  }));
}
/** Endpoint capabilities for one App Router `route` file or Pages Router API file. */
export async function endpointDrafts(
  ctx: FileCtx,
  role: Extract<Role, { role: "route-handler" | "api" }>,
): Promise<Draft<EndpointCapability>[]> {
  const { file, sf } = ctx;
  const table = tableOf(sf);
  const pathParams = /\[/.test(role.path);
  const out: Draft<EndpointCapability>[] = [];
  if (table.dynamic.length) {
    const line = lineOf(table.dynamic[0] as ts.Node);
    ctx.diags.push(diagnostic("SQ0270", file, line));
  }
  if (role.role === "route-handler") {
    let unresolved: number | undefined;
    for (const m of METHODS) {
      const hit = await ctx.graph.exported(file, m, walkFor(ctx));
      if (hit.kind !== "binding") {
        // Exported under a method name but not resolvable to a handler (a re-export of a destructured
        // value such as Auth.js `handlers`): report it, never guess and never stay silent.
        const exported = table.exports.get(m)?.at;
        if (exported && unresolved === undefined) unresolved = lineOf(exported);
        continue;
      }
      const at = table.exports.get(m)?.at;
      const line = at ? lineOf(at) : 1;
      const fn = await functionOf(hit.binding, ctx);
      const r = fn
        ? await analyzeInput(fn.fn, "app", ctx, pathParams)
        : {
            support: "needs-review" as const,
            reason: "The handler is not a plain function.",
            code: "SQ0230" as const,
            sensitive: false,
          };
      if (r.support !== "proven") ctx.diags.push(diagnostic("SQ0230", file, line, r.reason));
      out.push(
        draft(
          m,
          role.path,
          file,
          line,
          "app",
          "next-app-route-handler",
          `Exported ${m} handler`,
          r,
          [m],
          docOf(hit.binding.node).description,
        ),
      );
    }
    if (unresolved !== undefined) ctx.diags.push(diagnostic("SQ0270", file, unresolved));
    else if (!out.length && table.stars.length) ctx.diags.push(diagnostic("SQ0270", file, 1));
    return out;
  }
  const def = await ctx.graph.exported(file, "default", walkFor(ctx));
  const fn = def.kind === "binding" ? await functionOf(def.binding, ctx) : undefined;
  const defAt = table.exports.get("default")?.at;
  const defLine = defAt ? lineOf(defAt) : 1;
  const methods = fn ? pagesMethods(fn.fn) : [];
  const r = fn
    ? await analyzeInput(fn.fn, "pages", ctx, pathParams)
    : {
        support: "needs-review" as const,
        reason: "The default export is not a plain function.",
        code: "SQ0230" as const,
        sensitive: false,
      };
  if (!methods.length) {
    ctx.diags.push(diagnostic("SQ0150", file, defLine));
    out.push(
      draft(
        "ANY",
        role.path,
        file,
        defLine,
        "pages",
        "next-pages-api",
        "Pages API handler",
        {
          ...r,
          support: "needs-review",
          reason: "Request methods could not be determined from literal comparisons.",
          code: "SQ0150",
        },
        [],
      ),
    );
    return out;
  }
  if (r.support !== "proven") ctx.diags.push(diagnostic("SQ0230", file, defLine, r.reason));
  for (const { method, line } of methods)
    out.push(
      draft(method, role.path, file, line, "pages", "next-pages-api", `Handles ${method}`, r, [
        method,
      ]),
    );
  return out;
}
