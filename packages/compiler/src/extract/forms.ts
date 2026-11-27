import type { FormCapability } from "@speeq/core/manifest";
import ts from "typescript";
import { type Draft, evidence, UNOBSERVED } from "../capability.js";
import { diagnostic } from "../diagnostics.js";
import { capabilityId } from "../ids.js";
import { stringValue, unwrap } from "../nextjs/metadata.js";
import { sensitivityOfPath, sensitivityOfSymbol } from "../nextjs/sensitivity.js";
import { isSensitiveName } from "../schema/sensitive-names.js";
import { lineOf, nodes } from "../ts/parse.js";
import type { FileCtx } from "./context.js";
import { walkFor } from "./context.js";

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
function tag(el: Opening) {
  return ts.isIdentifier(el.tagName) ? el.tagName.text : undefined;
}
function attr(el: Opening, name: string): ts.JsxAttribute | undefined {
  for (const a of el.attributes.properties)
    if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name) return a;
  return undefined;
}
/** A literal attribute value: `"x"`, `{"x"}`, bare (true), or `{true}`/`{false}`. */
function attrLiteral(a: ts.JsxAttribute | undefined): string | boolean | undefined {
  if (!a) return undefined;
  const v = a.initializer;
  if (!v) return true;
  if (ts.isStringLiteral(v)) return v.text;
  if (ts.isJsxExpression(v) && v.expression) {
    const x = unwrap(v.expression);
    if (x.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (x.kind === ts.SyntaxKind.FalseKeyword) return false;
    return stringValue(x);
  }
  return undefined;
}
interface Field {
  name: string;
  type: string;
  required: boolean;
  sensitive: boolean;
}
function fieldOf(el: Opening, name: string, type: string): Field {
  const ac = attrLiteral(attr(el, "autoComplete"));
  const sensitive =
    type === "password" ||
    (typeof ac === "string" && /^(cc-|current-password|new-password|one-time-code)/.test(ac)) ||
    isSensitiveName(name);
  return { name, type, required: attrLiteral(attr(el, "required")) === true, sensitive };
}
/** Native `<form>` elements and React Hook Form `register` calls. Discovery only, never a binding. */
export async function formDrafts(ctx: FileCtx): Promise<Draft<FormCapability>[]> {
  const { file, sf } = ctx;
  if (!/\.(tsx|jsx|js)$/.test(file) || !sf.text.includes("<form")) return [];
  const out: Draft<FormCapability>[] = [];
  let index = 0;
  for (const n of nodes(sf)) {
    if (!ts.isJsxElement(n) || tag(n.openingElement) !== "form") continue;
    index++;
    const open = n.openingElement;
    const line = lineOf(n);
    const fields: Field[] = [];
    let dynamic = false;
    for (const d of nodes(n)) {
      if (ts.isJsxOpeningElement(d) || ts.isJsxSelfClosingElement(d)) {
        const t = tag(d);
        if (t === "input" || t === "select" || t === "textarea" || t === "Controller") {
          const nameAttr = attr(d, "name");
          const nm = attrLiteral(nameAttr);
          const type = t === "input" ? attrLiteral(attr(d, "type")) : t.toLowerCase();
          if (typeof nm === "string")
            fields.push(fieldOf(d, nm, typeof type === "string" ? type : "text"));
          else if (nameAttr) dynamic = true;
        }
        for (const a of d.attributes.properties) {
          if (!ts.isJsxSpreadAttribute(a)) continue;
          const call = unwrap(a.expression);
          if (
            ts.isCallExpression(call) &&
            ts.isIdentifier(call.expression) &&
            call.expression.text === "register"
          ) {
            const nm = stringValue(call.arguments[0]);
            const type = attrLiteral(attr(d, "type"));
            if (nm === undefined) dynamic = true;
            else fields.push(fieldOf(d, nm, typeof type === "string" ? type : "text"));
          }
        }
      }
    }
    const idAttr = attrLiteral(attr(open, "id")) ?? attrLiteral(attr(open, "name"));
    const key = typeof idAttr === "string" && idAttr ? idAttr : `form${index}`;
    const actionAttr = attr(open, "action");
    let actionRef: string | undefined;
    const ai = actionAttr?.initializer;
    if (ai && ts.isJsxExpression(ai) && ai.expression) {
      const e = unwrap(ai.expression);
      if (ts.isIdentifier(e)) {
        const r = await ctx.graph.identifier(file, e.text, walkFor(ctx));
        if (r.kind === "binding")
          actionRef = capabilityId("function", `${r.binding.file}#${r.binding.name}`);
      }
    }
    const submits = !!actionAttr || !!attr(open, "onSubmit");
    const routeId = ctx.role?.role === "page" ? capabilityId("route", ctx.role.path) : undefined;
    const sensitive = fields.some((f) => f.sensitive);
    if (dynamic) ctx.diags.push(diagnostic("SQ0240", file, line));
    const review = dynamic || fields.length === 0;
    out.push({
      id: capabilityId("form", `${file}#${key}`),
      kind: "form",
      title: key.slice(0, 80),
      framework: ctx.framework,
      source: { file, line },
      evidence: [evidence("jsx-form", file, line, "Native form element")],
      support: review ? "needs-review" : "proven",
      ...(review
        ? {
            supportReason: dynamic
              ? "A field name is not a string literal."
              : "The form has no named fields.",
          }
        : {}),
      access: submits ? "write" : "unknown",
      sensitivity: sensitive
        ? "credentials"
        : ctx.role?.role === "page"
          ? sensitivityOfPath(ctx.role.path)
          : sensitivityOfSymbol(file, key),
      auth: { ...UNOBSERVED, evidence: [] },
      related: [],
      ...(routeId ? { routeId } : {}),
      fields,
      ...(actionRef ? { actionRef } : {}),
      runtimeBinding: "none",
    });
  }
  return out;
}
