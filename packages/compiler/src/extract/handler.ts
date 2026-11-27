import ts from "typescript";
import { unwrap } from "../nextjs/metadata.js";
import type { Binding } from "../ts/exports.js";
import { type FileCtx, walkFor } from "./context.js";

/** A function whose parameters and body can be read. */
export type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

function fromExpression(e: ts.Expression): FunctionLike | undefined {
  const x = unwrap(e);
  return ts.isArrowFunction(x) || ts.isFunctionExpression(x) ? x : undefined;
}
/** The function behind a binding, following `const handler = other` hops. `undefined` for wrappers. */
export async function functionOf(
  binding: Binding,
  ctx: FileCtx,
  hops = 3,
): Promise<{ fn: FunctionLike; file: string } | undefined> {
  const n = binding.node;
  if (ts.isFunctionDeclaration(n)) return { fn: n, file: binding.file };
  let init: ts.Expression | undefined;
  if (ts.isVariableDeclaration(n)) init = n.initializer;
  else if (ts.isExportAssignment(n)) init = n.expression;
  if (!init) return;
  const direct = fromExpression(init);
  if (direct) return { fn: direct, file: binding.file };
  const x = unwrap(init);
  if (hops > 0 && ts.isIdentifier(x)) {
    const r = await ctx.graph.identifier(binding.file, x.text, walkFor(ctx));
    if (r.kind === "binding") return functionOf(r.binding, ctx, hops - 1);
  }
  return;
}
/** Is the first directive in the file `"use server"`? */
export function hasUseServer(sf: ts.SourceFile) {
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false;
    if (st.expression.text === "use server") return true;
  }
  return false;
}
