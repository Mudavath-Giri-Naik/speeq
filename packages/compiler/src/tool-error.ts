import { type DiagnosticCode, diagnostics } from "./diagnostics.js";
/** Stable development-time diagnostic without host source or native error text. */
export class ToolError extends Error {
  constructor(
    readonly code: DiagnosticCode,
    readonly details?: Record<string, string | number>,
  ) {
    super(diagnostics[code].meaning);
    this.name = "ToolError";
  }
}
