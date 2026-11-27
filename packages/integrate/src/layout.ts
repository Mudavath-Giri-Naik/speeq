import ts from "typescript";

/** Result of trying to add the assistant to a root layout. */
export type LayoutSplice = { ok: true; text: string } | { ok: false; reason: string };

const parse = (text: string) =>
  ts.createSourceFile("layout.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const errorCount = (text: string) =>
  ts.transpileModule(text, {
    reportDiagnostics: true,
    fileName: "layout.tsx",
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  }).diagnostics?.length ?? 0;

/**
 * Adds `import { SpeeqAssistant } from "<importPath>"` and `<SpeeqAssistant />` just before the
 * closing `</body>` of a root layout. It only edits one shape: a single `<body>` element that renders
 * `{children}`. Anything else (no body, two bodies, no children, already wired) returns `ok: false`
 * with a reason, and the caller prints a snippet instead. The edit is two text splices; the result is
 * re-parsed and rejected if it has more syntax errors than the original.
 */
export function spliceLayout(source: string, importPath: string): LayoutSplice {
  if (source.includes("SpeeqAssistant"))
    return { ok: false, reason: "The layout already uses the assistant." };
  const sf = parse(source);
  const bodies: ts.JsxElement[] = [];
  let selfClosing = 0;
  const visit = (n: ts.Node) => {
    if (ts.isJsxSelfClosingElement(n) && ts.isIdentifier(n.tagName) && n.tagName.text === "body")
      selfClosing++;
    if (
      ts.isJsxElement(n) &&
      ts.isIdentifier(n.openingElement.tagName) &&
      n.openingElement.tagName.text === "body"
    )
      bodies.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const body = bodies[0];
  if (bodies.length !== 1 || selfClosing > 0 || !body)
    return { ok: false, reason: "Expected exactly one <body> element." };
  if (!body.getText(sf).includes("{children}"))
    return { ok: false, reason: "The <body> does not render {children}." };
  const closing = body.closingElement.getStart(sf);
  const lineStart = source.lastIndexOf("\n", closing - 1) + 1;
  const before = source.slice(lineStart, closing);
  const indent = before.slice(0, before.length - before.trimStart().length);
  const nl = source.includes("\r\n") ? "\r\n" : "\n";
  const ownLine = before.trim() === "";
  const insert = ownLine ? `${indent}  <SpeeqAssistant />${nl}` : "<SpeeqAssistant />";
  const at = ownLine ? lineStart : closing;
  let text = source.slice(0, at) + insert + source.slice(at);
  // The import goes after the last import, or after a leading directive such as "use client".
  const line = `import { SpeeqAssistant } from ${JSON.stringify(importPath)};`;
  const parsed = parse(text);
  const last = parsed.statements.filter(ts.isImportDeclaration).at(-1);
  const directive = parsed.statements.find(
    (s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression),
  );
  const pos = (last ?? directive)?.getEnd();
  text =
    pos === undefined
      ? `${line}${nl}${text}`
      : `${text.slice(0, pos)}${nl}${line}${text.slice(pos)}`;
  if (errorCount(text) > errorCount(source))
    return { ok: false, reason: "The edited layout did not parse." };
  return { ok: true, text };
}
