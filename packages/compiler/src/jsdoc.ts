import ts from "typescript";

/** Strip control characters, collapse whitespace and cap the length. Comments are data. */
export function cleanText(text: string, max: number) {
  return text
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
/** Documentation text and the only comment tags that carry meaning. */
export interface Doc {
  description?: string;
  /** `@speeq`, optionally followed by `read` or `write`. */
  speeq?: { access?: "read" | "write" };
  ignore: boolean;
}
function tagsOf(node: ts.Node): readonly ts.JSDocTag[] {
  try {
    return ts.getJSDocTags(node);
  } catch {
    return [];
  }
}
/** Read leading JSDoc for a declaration. Never evaluates or trusts its contents. */
export function docOf(node: ts.Node): Doc {
  const doc: Doc = { ignore: false };
  for (const tag of tagsOf(node)) {
    const name = tag.tagName.text;
    if (name === "speeq-ignore") doc.ignore = true;
    if (name === "speeq") {
      const word = cleanText(ts.getTextOfJSDocComment(tag.comment) ?? "", 20).split(" ")[0];
      doc.speeq = word === "read" || word === "write" ? { access: word } : {};
    }
  }
  const owner = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  const jsDocs = (owner as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc;
  const text = jsDocs?.length ? ts.getTextOfJSDocComment(jsDocs[jsDocs.length - 1]?.comment) : "";
  const cleaned = cleanText(text ?? "", 300);
  if (cleaned) doc.description = cleaned;
  return doc;
}
