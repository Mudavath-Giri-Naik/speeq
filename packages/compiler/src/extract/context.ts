import type { Diagnostic, Framework } from "@speeq/core/manifest";
import type ts from "typescript";
import type { Role } from "../nextjs/roles.js";
import { type ModuleGraph, type WalkContext, walk } from "../ts/exports.js";
import type { SourceProject, Touched } from "../ts/project.js";

/** Everything an extractor needs about one file. Diagnostics accumulate in `diags`. */
export interface FileCtx {
  file: string;
  sf: ts.SourceFile;
  project: SourceProject;
  graph: ModuleGraph;
  touched: Touched;
  maxDepth: number;
  diags: Diagnostic[];
  /** Framework used for capabilities that do not belong to one router. */
  framework: Framework;
  /** Routing role of the file, when it takes part in routing. */
  role?: Role;
}
/** A fresh resolution walk that records dependencies into the file's tracker. */
export function walkFor(ctx: FileCtx): WalkContext {
  return walk(ctx.maxDepth, ctx.touched);
}
