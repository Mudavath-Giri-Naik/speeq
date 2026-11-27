import ts from "typescript";
/** Parse repository code as data. Reject malformed or excessively nested input. */
export function parseSource(file: string, text: string) {
  try {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (
      (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
        .length
    )
      return;
    return source;
  } catch {
    return;
  }
}
/** Iterative syntax traversal avoids consuming the JS call stack. */
export function* nodes(root: ts.Node): Generator<ts.Node> {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n) break;
    yield n;
    const children: ts.Node[] = [];
    ts.forEachChild(n, (c) => {
      children.push(c);
    });
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child) stack.push(child);
    }
  }
}
/** Evidence uses one-based source lines. */
export function lineOf(node: ts.Node) {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
}
