import type { Capability, Evidence } from "@speeq/core/manifest";
import type ts from "typescript";
import { lineOf } from "./ts/parse.js";

/** A capability before its fingerprint and cross-file observations are final. */
export type Draft<C = Capability> = C extends unknown ? Omit<C, "fingerprint"> : never;
/** Build evidence. Notes never contain source text. */
export function evidence(detector: string, file: string, line: number, note: string): Evidence {
  return { detector, file, line, note: note.slice(0, 200) };
}
/** Neutral auth observation filled in once middleware is known. */
export const UNOBSERVED = { observed: "unknown", evidence: [] } as const;
/** Evidence line of a node. */
export function at(node: ts.Node) {
  return lineOf(node);
}
