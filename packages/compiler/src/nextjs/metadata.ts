import ts from "typescript";
import { cleanText } from "../jsdoc.js";

/** Remove parentheses, `as` and `satisfies` wrappers. */
export function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x))
    x = x.expression;
  return x;
}
/** The string value of a plain or no-substitution template literal. */
export function stringValue(e: ts.Expression | undefined): string | undefined {
  if (!e) return;
  const x = unwrap(e);
  return ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? x.text : undefined;
}
/** Name of a property key when it is an identifier or string literal. */
export function keyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}
/** Look up a property assignment in an object literal by literal key. */
export function property(obj: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const p of obj.properties)
    if (ts.isPropertyAssignment(p) && keyName(p.name) === key) return p.initializer;
  return undefined;
}
/** Static title and description from `export const metadata = { ... }`. Dynamic values are ignored. */
export function literalMetadata(sf: ts.SourceFile): { title?: string; description?: string } {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== "metadata" || !d.initializer) continue;
      const obj = unwrap(d.initializer);
      if (!ts.isObjectLiteralExpression(obj)) return {};
      const t = property(obj, "title");
      let title = stringValue(t);
      if (title === undefined && t) {
        const o = unwrap(t);
        if (ts.isObjectLiteralExpression(o))
          title = stringValue(property(o, "absolute")) ?? stringValue(property(o, "default"));
      }
      const description = stringValue(property(obj, "description"));
      return {
        ...(title ? { title: cleanText(title, 80) } : {}),
        ...(description ? { description: cleanText(description, 300) } : {}),
      };
    }
  }
  return {};
}
