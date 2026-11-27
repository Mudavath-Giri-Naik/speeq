import type { FunctionCapability } from "@speeq/core/manifest";
import ts from "typescript";
import { type Draft, evidence, UNOBSERVED } from "../capability.js";
import { type DiagnosticCode, diagnostic } from "../diagnostics.js";
import { canonicalJson } from "../fingerprint.js";
import { capabilityId } from "../ids.js";
import { docOf } from "../jsdoc.js";
import { sensitivityOfSymbol, words } from "../nextjs/sensitivity.js";
import { schemaHasSensitive } from "../schema/sensitive-names.js";
import {
  type Attempt,
  extractNamed,
  extractSchema,
  type SchemaCtx,
  schemaCtx,
} from "../schema/zod.js";
import { tableOf } from "../ts/exports.js";
import { lineOf, nodes } from "../ts/parse.js";
import { type FileCtx, walkFor } from "./context.js";
import { type FunctionLike, functionOf, hasUseServer } from "./handler.js";

const PARSE = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const INFER = new Set(["infer", "input", "output"]);

function titleOf(name: string) {
  const w = words(name);
  return w.length ? (w[0] as string).charAt(0).toUpperCase() + w.join(" ").slice(1) : name;
}
interface Signature {
  input?: FunctionCapability["input"];
  validates: boolean;
  support: "proven" | "needs-review";
  reason?: string;
  code?: DiagnosticCode;
  sensitive: boolean;
}
async function signature(fn: FunctionLike, ctx: FileCtx): Promise<Signature> {
  const fail = (reason: string, code: DiagnosticCode): Signature => ({
    validates: false,
    support: "needs-review",
    reason,
    code,
    sensitive: false,
  });
  const params = fn.parameters;
  if (!params.length)
    return {
      input: {
        schema: { type: "object", properties: {}, additionalProperties: false },
        source: "none",
      },
      validates: false,
      support: "proven",
      sensitive: false,
    };
  const isForm = (p: ts.ParameterDeclaration) =>
    p.type?.getText() === "FormData" ||
    (ts.isIdentifier(p.name) && /form.?data/i.test(p.name.text));
  if (params.some(isForm)) return fail("Form data actions need a manual input contract.", "SQ0221");
  if (params.length > 1)
    return fail("Only functions with a single parameter are supported.", "SQ0222");
  const p = params[0] as ts.ParameterDeclaration;
  const sf = fn.getSourceFile();
  const sctx: SchemaCtx = schemaCtx(ctx.graph, sf.fileName, sf, walkFor(ctx));
  let fromType: Attempt | undefined;
  const t = p.type;
  if (t && ts.isTypeReferenceNode(t) && t.typeArguments?.length === 1) {
    const name = t.typeName;
    const last = ts.isIdentifier(name) ? name.text : name.right.text;
    const arg = t.typeArguments[0] as ts.TypeNode;
    if (INFER.has(last) && ts.isTypeQueryNode(arg))
      fromType = await extractNamed(arg.exprName, sctx);
  }
  let fromParse: Attempt | undefined;
  if (ts.isIdentifier(p.name) && fn.body) {
    for (const n of nodes(fn.body)) {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) continue;
      if (!PARSE.has(n.expression.name.text)) continue;
      let a = n.arguments[0];
      while (a && (ts.isParenthesizedExpression(a) || ts.isAwaitExpression(a))) a = a.expression;
      if (a && ts.isIdentifier(a) && a.text === p.name.text) {
        fromParse = await extractSchema(n.expression.expression, sctx);
        break;
      }
    }
  }
  const chosen = fromParse ?? fromType;
  if (!chosen) return fail("No Zod schema evidence for the parameter.", "SQ0231");
  if (!chosen.ok) return fail(chosen.detail, chosen.code);
  if (
    fromParse &&
    fromType?.ok &&
    canonicalJson(fromType.value.schema) !==
      canonicalJson(fromParse.ok ? fromParse.value.schema : null)
  )
    return fail("The parameter type and the parsed schema differ.", "SQ0231");
  return {
    input: { schema: chosen.value.schema, source: "zod" },
    validates: !!fromParse,
    support: "proven",
    sensitive: schemaHasSensitive(chosen.value.schema),
  };
}
/** Candidate server functions in one file: `"use server"` exports and `@speeq` tagged exports. */
export async function functionDrafts(ctx: FileCtx): Promise<Draft<FunctionCapability>[]> {
  const { file, sf } = ctx;
  const useServer = hasUseServer(sf);
  const table = tableOf(sf);
  const out: Draft<FunctionCapability>[] = [];
  if (useServer && table.dynamic.length)
    ctx.diags.push(diagnostic("SQ0270", file, lineOf(table.dynamic[0] as ts.Node)));
  for (const [name, entry] of [...table.exports].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (name === "default" && !useServer) continue;
    const hit = await ctx.graph.exported(file, name, walkFor(ctx));
    if (hit.kind !== "binding") continue;
    const doc = docOf(hit.binding.node);
    if (doc.ignore) continue;
    if (!useServer && !doc.speeq) continue;
    const found = await functionOf(hit.binding, ctx);
    if (!found) continue;
    const line = lineOf(entry.at);
    const sig = await signature(found.fn, ctx);
    if (sig.support !== "proven" && sig.code)
      ctx.diags.push(diagnostic(sig.code, file, line, sig.reason));
    const access = doc.speeq?.access ?? "unknown";
    const inputSensitive = sig.sensitive;
    out.push({
      id: capabilityId("function", `${file}#${name}`),
      kind: "function",
      title: titleOf(name).slice(0, 80),
      ...(doc.description ? { description: doc.description } : {}),
      framework: ctx.framework,
      source: { file, line },
      evidence: [
        evidence(
          useServer ? "use-server-export" : "speeq-tag",
          file,
          line,
          useServer ? "Exported from a use server module" : "Exported function with a @speeq tag",
        ),
      ],
      support: sig.support,
      ...(sig.support === "proven" ? {} : { supportReason: sig.reason ?? "Input not understood" }),
      access,
      sensitivity: inputSensitive ? "credentials" : sensitivityOfSymbol(file, name),
      auth: { ...UNOBSERVED, evidence: [] },
      related: [],
      export: { file, name, isServerAction: useServer },
      ...(sig.input ? { input: sig.input } : {}),
      validatesAtRuntime: sig.validates,
    });
  }
  return out;
}
/** Inline `"use server"` directives inside function bodies cannot be imported. */
export function inlineServerActions(ctx: FileCtx) {
  if (!ctx.sf.text.includes("use server")) return;
  for (const n of nodes(ctx.sf)) {
    if (!ts.isBlock(n) || !n.parent) continue;
    const p = n.parent;
    if (
      !(
        ts.isFunctionDeclaration(p) ||
        ts.isFunctionExpression(p) ||
        ts.isArrowFunction(p) ||
        ts.isMethodDeclaration(p)
      )
    )
      continue;
    const s = n.statements[0];
    if (
      s &&
      ts.isExpressionStatement(s) &&
      ts.isStringLiteral(s.expression) &&
      s.expression.text === "use server"
    )
      ctx.diags.push(diagnostic("SQ0220", ctx.file, lineOf(s)));
  }
}
