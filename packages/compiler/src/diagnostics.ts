import type { Diagnostic } from "@speeq/core/manifest";
/** Registered scanner diagnostics. */
export const diagnostics = {
  SQ0001: { severity: "error", meaning: "Path outside repository" },
  SQ0002: { severity: "error", meaning: "Denied or inaccessible file" },
  SQ0003: { severity: "warning", meaning: "Symlink skipped" },
  SQ0004: { severity: "warning", meaning: "File too large" },
  SQ0005: { severity: "warning", meaning: "File cap reached" },
  SQ0006: { severity: "error", meaning: "Scan deadline hit" },
  SQ0010: { severity: "error", meaning: "Manifest schema invalid" },
  SQ0011: { severity: "error", meaning: "Decisions schema invalid" },
} as const satisfies Record<string, { severity: Diagnostic["severity"]; meaning: string }>;
/** Stable compiler diagnostic code. */
export type DiagnosticCode = keyof typeof diagnostics;
