import ts from "typescript";
import { nodes } from "../ts/parse.js";
/** Existing speeq integration inventory. */
export interface ExistingSpeeq {
  installed: boolean;
  configFile?: string;
  manifestPresent: boolean;
  decisionsPresent: boolean;
  existingTools: number;
  existingRoutes: number;
}
/** Count explicit calls, excluding prose, strings and declarations. */
export function existingCalls(source: ts.SourceFile) {
  let tools = 0,
    routes = 0;
  for (const n of nodes(source)) {
    if (!ts.isCallExpression(n)) continue;
    const callee = n.expression;
    if (ts.isIdentifier(callee)) {
      if (callee.text === "defineTool") tools++;
      if (callee.text === "defineRoute") routes++;
    }
  }
  return { tools, routes };
}

/** Combine installed package and config evidence with per-file call counts. */
export function existingSpeeq(
  files: readonly string[],
  prefix: string,
  installed: boolean,
  counts: { tools: number; routes: number }[],
): ExistingSpeeq {
  const configFile = ["ts", "js", "mjs"]
    .map((ext) => prefix + "speeq.config." + ext)
    .find((f) => files.includes(f));
  return {
    installed,
    configFile,
    manifestPresent: files.includes(prefix + ".speeq/manifest.json"),
    decisionsPresent: files.includes(prefix + ".speeq/decisions.json"),
    existingTools: counts.reduce((n, c) => n + c.tools, 0),
    existingRoutes: counts.reduce((n, c) => n + c.routes, 0),
  };
}
