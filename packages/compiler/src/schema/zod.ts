import type { JsonSchemaLite } from "@speeq/core/manifest";
import ts from "typescript";
import type { DiagnosticCode } from "../diagnostics.js";
import { cleanText } from "../jsdoc.js";
import { keyName, stringValue, unwrap } from "../nextjs/metadata.js";
import type { ModuleGraph, Resolved, WalkContext } from "../ts/exports.js";

/** A pattern the extractor deliberately does not support. Becomes a diagnostic, never a guess. */
export class Unsupported extends Error {
  constructor(
    readonly code: DiagnosticCode,
    readonly detail: string,
  ) {
    super(detail);
  }
}
/** A recovered schema plus how it behaves as an object property. */
export interface Extracted {
  schema: JsonSchemaLite;
  optional: boolean;
}
/** Result of an attempted extraction. */
export type Attempt =
  | { ok: true; value: Extracted }
  | { ok: false; code: DiagnosticCode; detail: string };
/** Where the expression lives and how far the walk has gone. */
export interface SchemaCtx {
  graph: ModuleGraph;
  file: string;
  sf: ts.SourceFile;
  wctx: WalkContext;
  depth: number;
  path: ReadonlySet<ts.Node>;
}
interface ZodNames {
  namespaces: Set<string>;
  named: Map<string, string>;
  mini: Set<string>;
}
const names = new WeakMap<ts.SourceFile, ZodNames>();
function zodNames(sf: ts.SourceFile): ZodNames {
  const hit = names.get(sf);
  if (hit) return hit;
  const out: ZodNames = { namespaces: new Set(), named: new Map(), mini: new Set() };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (spec !== "zod" && spec !== "zod/v4" && !spec.startsWith("zod/")) continue;
    const mini = spec !== "zod" && spec !== "zod/v4";
    const c = st.importClause;
    if (!c || c.isTypeOnly) continue;
    const add = (local: string, imported?: string) => {
      if (mini) out.mini.add(local);
      else if (imported === undefined || imported === "z") out.namespaces.add(local);
      else out.named.set(local, imported);
    };
    if (c.name) add(c.name.text);
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) add(nb.name.text);
    else if (nb) for (const e of nb.elements) add(e.name.text, (e.propertyName ?? e.name).text);
  }
  names.set(sf, out);
  return out;
}
/** Does this file import zod at all? Cheap pre-check for extractors. */
export function importsZod(sf: ts.SourceFile) {
  const n = zodNames(sf);
  return n.namespaces.size > 0 || n.named.size > 0 || n.mini.size > 0;
}
interface Step {
  name: string;
  args: readonly ts.Expression[];
}
function chain(expr: ts.Expression) {
  const steps: Step[] = [];
  let cur = expr;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    steps.unshift({ name: cur.expression.name.text, args: cur.arguments });
    cur = unwrap(cur.expression.expression);
  }
  return { base: cur, steps };
}
function num(e: ts.Expression | undefined): number | undefined {
  if (!e) return;
  const x = unwrap(e);
  if (ts.isNumericLiteral(x)) return Number(x.text);
  if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken) {
    const n = num(x.operand);
    return n === undefined ? undefined : -n;
  }
  return undefined;
}
function literalValue(e: ts.Expression | undefined): string | number | boolean | null | undefined {
  if (!e) return undefined;
  const x = unwrap(e);
  const s = stringValue(x);
  if (s !== undefined) return s;
  const n = num(x);
  if (n !== undefined) return n;
  if (x.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (x.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (x.kind === ts.SyntaxKind.NullKeyword) return null;
  return undefined;
}
function bad(code: DiagnosticCode, detail: string): never {
  throw new Unsupported(code, detail);
}
function failed(r: Resolved): never {
  if (r.kind === "unresolved" && r.reason === "depth")
    bad("SQ0213", "import depth limit or a cycle was reached");
  return bad("SQ0212", "the referenced schema could not be resolved");
}
/** Follow an identifier or `Namespace.name` to the expression that defines it. */
async function resolveExpr(
  e: ts.Expression,
  c: SchemaCtx,
): Promise<{ expr: ts.Expression; ctx: SchemaCtx; node: ts.Node }> {
  let r: Resolved;
  if (ts.isIdentifier(e)) r = await c.graph.identifier(c.file, e.text, c.wctx);
  else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
    const ns = await c.graph.identifier(c.file, e.expression.text, c.wctx);
    if (ns.kind !== "namespace") return failed(ns);
    r = await c.graph.exported(ns.file, e.name.text, c.wctx);
  } else return bad("SQ0211", "expression is not a schema builder call or reference");
  if (r.kind !== "binding") return failed(r);
  const b = r.binding;
  if (c.depth + 1 > c.wctx.max || c.path.has(b.node)) bad("SQ0213", "cycle or depth limit");
  let init: ts.Expression | undefined;
  if (ts.isVariableDeclaration(b.node)) init = b.node.initializer;
  else if (ts.isExportAssignment(b.node)) init = b.node.expression;
  if (!init) return bad("SQ0211", "reference is not a schema value");
  return {
    expr: init,
    node: b.node,
    ctx: {
      ...c,
      file: b.file,
      sf: b.sf,
      depth: c.depth + 1,
      path: new Set([...c.path, b.node]),
    },
  };
}
async function constStrings(e: ts.Expression, c: SchemaCtx): Promise<string[]> {
  let x = unwrap(e);
  let ctx = c;
  if (ts.isIdentifier(x) || ts.isPropertyAccessExpression(x)) {
    const r = await resolveExpr(x, c);
    x = unwrap(r.expr);
    ctx = r.ctx;
  }
  void ctx;
  if (ts.isArrayLiteralExpression(x)) {
    const out = x.elements.map((el) => stringValue(el));
    if (out.length && out.every((v): v is string => v !== undefined)) return out;
  }
  if (ts.isObjectLiteralExpression(x)) {
    const out: string[] = [];
    for (const p of x.properties) {
      const v = ts.isPropertyAssignment(p) ? stringValue(p.initializer) : undefined;
      if (v === undefined) return bad("SQ0211", "enum values are not string literals");
      out.push(v);
    }
    if (out.length) return out;
  }
  return bad("SQ0211", "enum values are not a literal array");
}
interface State {
  schema: JsonSchemaLite;
  optional: boolean;
  nullable: boolean;
}
async function objectShape(obj: ts.Expression, c: SchemaCtx, strict: boolean): Promise<State> {
  const x = unwrap(obj);
  if (!ts.isObjectLiteralExpression(x)) return bad("SQ0211", "object shape is not a literal");
  const properties: Record<string, JsonSchemaLite> = {};
  const required: string[] = [];
  for (const p of x.properties) {
    let key: string | undefined, value: ts.Expression | undefined;
    if (ts.isPropertyAssignment(p)) {
      key = keyName(p.name);
      value = p.initializer;
    } else if (ts.isShorthandPropertyAssignment(p)) {
      key = p.name.text;
      value = p.name;
    }
    if (key === undefined || !value)
      return bad("SQ0211", "object shape has a spread or computed key");
    const r = await schemaOf(value, c);
    properties[key] = r.schema;
    if (!r.optional) required.push(key);
  }
  const schema: JsonSchemaLite = { type: "object", properties };
  if (required.length) schema.required = required;
  if (strict) schema.additionalProperties = false;
  return { schema, optional: false, nullable: false };
}
async function builder(
  name: string,
  args: readonly ts.Expression[],
  coerce: boolean,
  c: SchemaCtx,
): Promise<State> {
  const st = (schema: JsonSchemaLite): State => ({ schema, optional: false, nullable: false });
  const a0 = args[0];
  switch (name) {
    case "object":
    case "strictObject":
      if (coerce || !a0) return bad("SQ0211", name);
      return objectShape(a0, c, name === "strictObject");
    case "string":
      return st({ type: "string" });
    case "number":
      return st({ type: "number" });
    case "boolean":
      return st({ type: "boolean" });
    case "enum":
      if (coerce || !a0) return bad("SQ0211", "enum");
      return st({ type: "string", enum: await constStrings(a0, c) });
    case "literal": {
      const v = literalValue(a0);
      if (v === undefined || v === null || coerce) return bad("SQ0211", "literal");
      return st({ type: typeof v as "string" | "number" | "boolean", enum: [v] });
    }
    case "array": {
      if (coerce || !a0) return bad("SQ0211", "array");
      return st({ type: "array", items: (await schemaOf(a0, c)).schema });
    }
    case "union": {
      const list = a0 && unwrap(a0);
      if (coerce || !list || !ts.isArrayLiteralExpression(list) || !list.elements.length)
        return bad("SQ0211", "union");
      const members: JsonSchemaLite[] = [];
      for (const el of list.elements) members.push((await schemaOf(el, c)).schema);
      return st({ anyOf: members });
    }
    default:
      return bad("SQ0211", `z.${name}`);
  }
}
function modify(s: State, step: Step): State {
  const { name, args } = step;
  const sc: JsonSchemaLite = { ...s.schema };
  const t = sc.type;
  const n = num(args[0]);
  const need = (cond: boolean) => {
    if (!cond) bad("SQ0211", `.${name}() on this schema type`);
  };
  const out = (): State => ({ ...s, schema: sc });
  switch (name) {
    case "optional":
      return { ...out(), optional: true };
    case "nullable":
      return { ...out(), nullable: true };
    case "nullish":
      return { ...out(), optional: true, nullable: true };
    case "default": {
      const v = literalValue(args[0]);
      if (v === undefined) return bad("SQ0211", ".default() with a non-literal value");
      sc.default = v;
      return { ...out(), optional: true };
    }
    case "describe": {
      const d = stringValue(args[0]);
      if (d === undefined) return bad("SQ0211", ".describe() with a non-literal value");
      sc.description = cleanText(d, 200);
      return out();
    }
    case "min":
    case "max":
    case "length": {
      need(n !== undefined && Number.isFinite(n));
      const lo = name !== "max",
        hi = name !== "min";
      if (t === "string") {
        if (lo) sc.minLength = n as number;
        if (hi) sc.maxLength = n as number;
      } else if (t === "number" || t === "integer") {
        need(name !== "length");
        if (lo) sc.minimum = n as number;
        if (hi) sc.maximum = n as number;
      } else if (t === "array") {
        if (lo) sc.minItems = n as number;
        if (hi) sc.maxItems = n as number;
      } else need(false);
      return out();
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      need((t === "number" || t === "integer") && n !== undefined);
      if (name === "gt") sc.exclusiveMinimum = n as number;
      if (name === "gte") sc.minimum = n as number;
      if (name === "lt") sc.exclusiveMaximum = n as number;
      if (name === "lte") sc.maximum = n as number;
      return out();
    case "int":
      need(t === "number");
      sc.type = "integer";
      return out();
    case "positive":
      need(t === "number" || t === "integer");
      sc.exclusiveMinimum = 0;
      return out();
    case "nonnegative":
      need(t === "number" || t === "integer");
      sc.minimum = 0;
      return out();
    case "email":
    case "url":
    case "uuid":
      need(t === "string");
      sc.format = name === "url" ? "uri" : name;
      return out();
    case "regex": {
      need(t === "string");
      const re = args[0] && unwrap(args[0]);
      if (!re || !ts.isRegularExpressionLiteral(re)) return bad("SQ0211", ".regex() argument");
      const m = /^\/(.*)\/([a-z]*)$/s.exec(re.text);
      if (!m || m[2]) return bad("SQ0211", ".regex() with flags");
      sc.pattern = m[1] as string;
      return out();
    }
    case "trim":
    case "toLowerCase":
    case "toUpperCase":
      need(t === "string");
      return out();
    default:
      return bad("SQ0211", `.${name}()`);
  }
}
async function modifyObject(s: State, step: Step, c: SchemaCtx): Promise<State> {
  const sc = s.schema;
  if (sc.type !== "object") return bad("SQ0211", `.${step.name}() on a non-object`);
  const props = { ...(sc.properties ?? {}) };
  const req = new Set(sc.required ?? []);
  const arg = step.args[0];
  if (step.name === "partial") {
    if (step.args.length) return bad("SQ0211", ".partial() with arguments");
    req.clear();
  } else if (step.name === "extend") {
    if (!arg) return bad("SQ0211", ".extend()");
    const add = await objectShape(arg, c, false);
    for (const [k, v] of Object.entries(add.schema.properties ?? {})) props[k] = v;
    for (const k of Object.keys(add.schema.properties ?? {})) req.delete(k);
    for (const k of add.schema.required ?? []) req.add(k);
  } else {
    const o = arg && unwrap(arg);
    if (!o || !ts.isObjectLiteralExpression(o)) return bad("SQ0211", `.${step.name}() keys`);
    const keys = new Set<string>();
    for (const p of o.properties) {
      const k = ts.isPropertyAssignment(p) ? keyName(p.name) : undefined;
      if (k === undefined) return bad("SQ0211", `.${step.name}() keys`);
      keys.add(k);
    }
    for (const k of Object.keys(props)) {
      const keep = step.name === "pick" ? keys.has(k) : !keys.has(k);
      if (!keep) {
        delete props[k];
        req.delete(k);
      }
    }
  }
  const next: JsonSchemaLite = { ...sc, properties: props };
  delete next.required;
  const ordered = Object.keys(props).filter((k) => req.has(k));
  if (ordered.length) next.required = ordered;
  return { ...s, schema: next };
}
async function schemaOf(expr: ts.Expression, c: SchemaCtx): Promise<Extracted> {
  const { base, steps } = chain(unwrap(expr));
  const zn = zodNames(c.sf);
  let state: State;
  let rest = steps;
  if (ts.isIdentifier(base) && zn.mini.has(base.text)) return bad("SQ0210", "zod/mini");
  if (ts.isIdentifier(base) && zn.namespaces.has(base.text)) {
    const first = steps[0];
    if (!first) return bad("SQ0211", "bare zod namespace");
    state = await builder(first.name, first.args, false, c);
    rest = steps.slice(1);
  } else if (
    ts.isPropertyAccessExpression(base) &&
    base.name.text === "coerce" &&
    ts.isIdentifier(base.expression) &&
    zn.namespaces.has(base.expression.text)
  ) {
    const first = steps[0];
    if (!first || !["string", "number", "boolean"].includes(first.name))
      return bad("SQ0211", "z.coerce builder");
    state = await builder(first.name, first.args, true, c);
    rest = steps.slice(1);
  } else if (
    ts.isCallExpression(base) &&
    ts.isIdentifier(base.expression) &&
    zn.named.has(base.expression.text)
  ) {
    state = await builder(
      zn.named.get(base.expression.text) as string,
      Array.from(base.arguments),
      false,
      c,
    );
  } else {
    const r = await resolveExpr(base, c);
    const inner = await schemaOf(r.expr, r.ctx);
    state = { schema: inner.schema, optional: inner.optional, nullable: false };
  }
  for (const step of rest) {
    state = ["extend", "pick", "omit", "partial"].includes(step.name)
      ? await modifyObject(state, step, c)
      : modify(state, step);
  }
  const schema: JsonSchemaLite = state.nullable
    ? { anyOf: [state.schema, { type: "null" }] }
    : state.schema;
  return { schema, optional: state.optional };
}
/** Recover a JSON Schema from a Zod expression. Anything not understood is reported, never guessed. */
export async function extractSchema(expr: ts.Expression, ctx: SchemaCtx): Promise<Attempt> {
  try {
    return { ok: true, value: await schemaOf(expr, ctx) };
  } catch (e) {
    if (e instanceof Unsupported) return { ok: false, code: e.code, detail: e.detail };
    throw e;
  }
}
/** Starting context for an expression found in `sf`. */
export function schemaCtx(graph: ModuleGraph, file: string, sf: ts.SourceFile, wctx: WalkContext) {
  return { graph, file, sf, wctx, depth: 0, path: new Set<ts.Node>() } satisfies SchemaCtx;
}
/** Recover a schema from the name in `typeof Name` or `typeof Namespace.Name`. */
export async function extractNamed(name: ts.EntityName, ctx: SchemaCtx): Promise<Attempt> {
  const expr = ts.isIdentifier(name)
    ? ts.factory.createIdentifier(name.text)
    : ts.isIdentifier(name.left)
      ? ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier(name.left.text),
          name.right.text,
        )
      : undefined;
  if (!expr) return { ok: false, code: "SQ0212", detail: "nested namespace" };
  return extractSchema(expr, ctx);
}
