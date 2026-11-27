import type { FilterSetCapability, JsonSchemaLite } from "@speeq/core/manifest";
import ts from "typescript";
import { type Draft, evidence, UNOBSERVED } from "../capability.js";
import { diagnostic } from "../diagnostics.js";
import { capabilityId } from "../ids.js";
import { stringValue, unwrap } from "../nextjs/metadata.js";
import { sensitivityOfPath } from "../nextjs/sensitivity.js";
import { extractSchema, schemaCtx } from "../schema/zod.js";
import { tableOf } from "../ts/exports.js";
import { lineOf, nodes } from "../ts/parse.js";
import { type FileCtx, walkFor } from "./context.js";
import { functionOf } from "./handler.js";

const PARSE = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
function strip(e: ts.Expression): ts.Expression {
  let x = unwrap(e);
  while (ts.isAwaitExpression(x)) x = unwrap(x.expression);
  return x;
}
/**
 * Filter sets from structural evidence only: a Zod schema parsed from a page's `searchParams`, or
 * literal `useSearchParams().get("x")` reads in the page file itself. Names are never invented
 * from labels or identifiers.
 */
export async function filterDrafts(ctx: FileCtx): Promise<Draft<FilterSetCapability>[]> {
  const { file, sf, role } = ctx;
  if (role?.role !== "page" || role.router !== "app") return [];
  const routeId = capabilityId("route", role.path);
  const common = {
    kind: "filter-set" as const,
    framework: ctx.framework,
    access: "read" as const,
    sensitivity: sensitivityOfPath(role.path),
    auth: { ...UNOBSERVED, evidence: [] },
    related: [],
    routeId,
  };
  const id = capabilityId("filter-set", role.path);
  const def = await ctx.graph.exported(file, "default", walkFor(ctx));
  const fn = def.kind === "binding" ? await functionOf(def.binding, ctx) : undefined;
  if (fn?.fn.body) {
    const spNames = new Set<string>();
    let props: string | undefined;
    const p0 = fn.fn.parameters[0];
    if (p0 && ts.isIdentifier(p0.name)) props = p0.name.text;
    else if (p0 && ts.isObjectBindingPattern(p0.name))
      for (const el of p0.name.elements)
        if (ts.isIdentifier(el.name) && (el.propertyName ?? el.name).getText() === "searchParams")
          spNames.add(el.name.text);
    const isRef = (e: ts.Expression): boolean => {
      const x = strip(e);
      if (ts.isIdentifier(x)) return spNames.has(x.text);
      return (
        ts.isPropertyAccessExpression(x) &&
        x.name.text === "searchParams" &&
        ts.isIdentifier(x.expression) &&
        x.expression.text === props
      );
    };
    for (const n of nodes(fn.fn.body))
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        isRef(n.initializer)
      )
        spNames.add(n.name.text);
    for (const n of nodes(fn.fn.body)) {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) continue;
      if (!PARSE.has(n.expression.name.text) || !n.arguments[0] || !isRef(n.arguments[0])) continue;
      const line = lineOf(n);
      const r = await extractSchema(
        n.expression.expression,
        schemaCtx(ctx.graph, file, sf, walkFor(ctx)),
      );
      const base = {
        ...common,
        id,
        title: `${role.path} filters`.slice(0, 80),
        source: { file, line },
        evidence: [
          evidence("searchparams-schema", file, line, "Schema parsed from page searchParams"),
        ],
      };
      if (r.ok && r.value.schema.type === "object") {
        const props = r.value.schema.properties ?? {};
        return [
          {
            ...base,
            support: "proven",
            parameters: Object.entries(props).map(([name, schema]) => ({ name, schema })),
          },
        ];
      }
      const detail = r.ok ? "The schema is not an object." : r.detail;
      ctx.diags.push(diagnostic("SQ0250", file, line, detail));
      return [{ ...base, support: "needs-review", supportReason: detail, parameters: [] }];
    }
  }
  const gets = new Map<string, number>();
  const hooks = new Set<string>();
  let hookLine = 0;
  for (const n of nodes(sf)) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(strip(n.initializer)) &&
      (strip(n.initializer) as ts.CallExpression).expression.getText() === "useSearchParams"
    ) {
      hooks.add(n.name.text);
      hookLine ||= lineOf(n);
    }
  }
  if (hooks.size) {
    for (const n of nodes(sf)) {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "get" &&
        ts.isIdentifier(n.expression.expression) &&
        hooks.has(n.expression.expression.text)
      ) {
        const lit = stringValue(n.arguments[0]);
        if (lit !== undefined && !gets.has(lit)) gets.set(lit, lineOf(n));
      }
    }
    if (gets.size) {
      const properties: JsonSchemaLite[] = [];
      void properties;
      ctx.diags.push(diagnostic("SQ0250", file, hookLine, "searchParams read without a schema"));
      return [
        {
          ...common,
          id,
          title: `${role.path} filters`.slice(0, 80),
          source: { file, line: hookLine },
          evidence: [evidence("use-search-params", file, hookLine, "useSearchParams reads")],
          support: "needs-review",
          supportReason: "Parameters come from literal reads with no schema.",
          parameters: [...gets.keys()].map((name) => ({ name })),
        },
      ];
    }
  }
  void tableOf;
  return [];
}
