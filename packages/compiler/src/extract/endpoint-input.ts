import type { EndpointCapability, JsonSchemaLite } from "@speeq/core/manifest";
import ts from "typescript";
import type { DiagnosticCode } from "../diagnostics.js";
import { unwrap } from "../nextjs/metadata.js";
import { isSensitiveName, schemaHasSensitive } from "../schema/sensitive-names.js";
import { type Attempt, extractSchema, schemaCtx } from "../schema/zod.js";
import { nodes } from "../ts/parse.js";
import { type FileCtx, walkFor } from "./context.js";
import type { FunctionLike } from "./handler.js";

/** What reading a handler's source says about its input. */
export interface InputResult {
  input?: EndpointCapability["input"];
  support: "proven" | "needs-review";
  reason?: string;
  code?: DiagnosticCode;
  sensitive: boolean;
}
const PARSE = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const BODY_READS = new Set(["formData", "text", "blob", "arrayBuffer"]);
function stripAwait(e: ts.Expression): ts.Expression {
  let x = unwrap(e);
  while (ts.isAwaitExpression(x)) x = unwrap(x.expression);
  return x;
}
function literalString(e: ts.Expression | undefined) {
  if (!e) return;
  const x = unwrap(e);
  return ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? x.text : undefined;
}
/**
 * Read a request handler and decide what input it takes. Only these shapes are understood: a body
 * read once through `S.parse(await req.json())`, a query read through `S.parse(Object.fromEntries(
 * searchParams))`, literal `searchParams.get("x")` calls, or no request input at all. The `pages`
 * mode adds `S.parse(req.body)`, `S.parse(req.query)` and `req.query.x`. Anything else needs review.
 */
export async function analyzeInput(
  fn: FunctionLike,
  mode: "app" | "pages",
  ctx: FileCtx,
  pathParams: boolean,
): Promise<InputResult> {
  const reqNames = new Set<string>();
  const first = fn.parameters[0];
  if (first && ts.isIdentifier(first.name)) reqNames.add(first.name.text);
  const jsonVars = new Set<string>(),
    urlNames = new Set<string>(),
    spNames = new Set<string>();
  const isReq = (e: ts.Expression) => {
    const x = unwrap(e);
    return ts.isIdentifier(x) && reqNames.has(x.text);
  };
  const isJsonCall = (e: ts.Expression): boolean => {
    const x = stripAwait(e);
    return (
      ts.isCallExpression(x) &&
      ts.isPropertyAccessExpression(x.expression) &&
      x.expression.name.text === "json" &&
      isReq(x.expression.expression)
    );
  };
  const isUrl = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    if (ts.isNewExpression(x)) return ts.isIdentifier(x.expression) && x.expression.text === "URL";
    if (ts.isPropertyAccessExpression(x)) return x.name.text === "nextUrl" && isReq(x.expression);
    return ts.isIdentifier(x) && urlNames.has(x.text);
  };
  const isSp = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    if (ts.isPropertyAccessExpression(x))
      return x.name.text === "searchParams" && isUrl(x.expression);
    return ts.isIdentifier(x) && spNames.has(x.text);
  };
  const body = fn.body;
  if (!body) return { support: "proven", input: { source: "none" }, sensitive: false };
  for (const n of nodes(body)) {
    if (!ts.isVariableDeclaration(n) || !n.initializer) continue;
    const init = stripAwait(n.initializer);
    if (ts.isIdentifier(n.name)) {
      if (isJsonCall(init)) jsonVars.add(n.name.text);
      else if (isUrl(init)) urlNames.add(n.name.text);
      else if (isSp(init)) spNames.add(n.name.text);
    } else if (ts.isObjectBindingPattern(n.name) && isUrl(init)) {
      for (const el of n.name.elements)
        if (ts.isIdentifier(el.name) && (el.propertyName ?? el.name).getText() === "searchParams")
          spNames.add(el.name.text);
    }
  }
  const unknown: string[] = [],
    consumed = new Set<ts.Node>(),
    bodyParses: ts.Expression[] = [],
    queryParses: ts.Expression[] = [],
    gets = new Set<string>();
  let jsonReads = 0;
  const all = [...nodes(body)];
  for (const n of all) {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) continue;
    const p = n.expression,
      arg = n.arguments[0] && stripAwait(n.arguments[0]);
    if (isJsonCall(n)) jsonReads++;
    if (BODY_READS.has(p.name.text) && isReq(p.expression))
      unknown.push(`request.${p.name.text}()`);
    if (PARSE.has(p.name.text) && arg) {
      if (isJsonCall(arg) || (ts.isIdentifier(arg) && jsonVars.has(arg.text))) {
        bodyParses.push(p.expression);
        consumed.add(arg);
      } else if (
        ts.isCallExpression(arg) &&
        ts.isPropertyAccessExpression(arg.expression) &&
        arg.expression.getText() === "Object.fromEntries" &&
        arg.arguments[0] &&
        isSp(arg.arguments[0])
      ) {
        queryParses.push(p.expression);
        consumed.add(unwrap(arg.arguments[0]));
      } else if (mode === "pages" && ts.isPropertyAccessExpression(arg) && isReq(arg.expression)) {
        if (arg.name.text === "body") bodyParses.push(p.expression);
        else if (arg.name.text === "query") queryParses.push(p.expression);
        else continue;
        consumed.add(arg);
      }
    }
    if (["get", "getAll", "has"].includes(p.name.text) && isSp(p.expression)) {
      const lit = literalString(n.arguments[0]);
      if (lit === undefined) unknown.push("searchParams read with a dynamic key");
      else gets.add(lit);
      consumed.add(unwrap(p.expression));
    }
  }
  for (const n of all) {
    const parent = n.parent;
    if (ts.isIdentifier(n) && parent) {
      if (ts.isVariableDeclaration(parent) && parent.name === n) continue;
      if (ts.isBindingElement(parent)) continue;
      if (ts.isPropertyAccessExpression(parent) && parent.name === n) continue;
      if (spNames.has(n.text) && !consumed.has(n))
        unknown.push("searchParams used in an unsupported way");
    } else if (ts.isPropertyAccessExpression(n)) {
      if (isSp(n) && !consumed.has(n) && !(parent && ts.isVariableDeclaration(parent)))
        unknown.push("searchParams used in an unsupported way");
      if (mode === "pages" && isReq(n.expression) && ["body", "query"].includes(n.name.text)) {
        if (consumed.has(n)) continue;
        const outer = parent && ts.isPropertyAccessExpression(parent) ? parent : undefined;
        if (n.name.text === "query" && outer && outer.expression === n) gets.add(outer.name.text);
        else unknown.push(`req.${n.name.text} used without a schema`);
      }
    }
  }
  const result = (r: Omit<InputResult, "sensitive">, sensitive: boolean): InputResult => ({
    ...r,
    sensitive,
  });
  const review = (reason: string, code: DiagnosticCode = "SQ0230", sensitive = false) =>
    result({ support: "needs-review", reason, code }, sensitive);
  if (unknown.length) return review(unknown[0] as string);
  if (pathParams) return review("The route has path parameters that the manifest does not model.");
  const sc = (e: ts.Expression): Promise<Attempt> =>
    extractSchema(
      e,
      schemaCtx(ctx.graph, fn.getSourceFile().fileName, fn.getSourceFile(), walkFor(ctx)),
    );
  const out: NonNullable<EndpointCapability["input"]> = { source: "none" };
  let sensitive = false;
  if (jsonReads > 0 || bodyParses.length) {
    const only = bodyParses[0];
    if (jsonReads !== 1 || bodyParses.length !== 1 || !only)
      return review("The request body is read without exactly one schema parse.");
    const r = await sc(only);
    if (!r.ok) return review(r.detail, r.code);
    out.body = r.value.schema;
    out.source = "zod";
    sensitive ||= schemaHasSensitive(r.value.schema);
  }
  if (queryParses.length > 1) return review("The query is parsed more than once.");
  const q = queryParses[0];
  if (q) {
    const r = await sc(q);
    if (!r.ok) return review(r.detail, r.code);
    out.query = r.value.schema;
    out.source = "zod";
    sensitive ||= schemaHasSensitive(r.value.schema);
  } else if (gets.size) {
    const properties: Record<string, JsonSchemaLite> = {};
    for (const k of [...gets].sort()) {
      properties[k] = { type: "string" };
      sensitive ||= isSensitiveName(k);
    }
    out.query = { type: "object", properties };
    return result(
      {
        support: "needs-review",
        reason: "Query parameters are read without a schema.",
        code: "SQ0230",
        input: out,
      },
      sensitive,
    );
  }
  return result({ support: "proven", input: out }, sensitive);
}
