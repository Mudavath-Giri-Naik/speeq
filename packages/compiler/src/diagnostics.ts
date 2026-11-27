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
  SQ0101: { severity: "warning", meaning: "Several applications found, one must be selected" },
  SQ0102: { severity: "error", meaning: "No Next.js application found" },
  SQ0103: { severity: "error", meaning: "Next.js older than version 13 is not supported" },
  SQ0104: { severity: "warning", meaning: "TypeScript configuration unreadable" },
  SQ0140: { severity: "warning", meaning: "Parallel route skipped" },
  SQ0141: { severity: "warning", meaning: "Intercepting route skipped" },
  SQ0142: { severity: "warning", meaning: "Route also defined by the other router" },
  SQ0150: { severity: "warning", meaning: "Pages API methods unknown" },
  SQ0160: { severity: "warning", meaning: "Middleware matcher cannot be interpreted" },
  SQ0170: { severity: "info", meaning: "Existing speeq tools or routes found" },
  SQ0210: { severity: "warning", meaning: "Unsupported zod entry point" },
  SQ0211: { severity: "warning", meaning: "Unsupported zod builder" },
  SQ0212: { severity: "warning", meaning: "Schema cannot be resolved" },
  SQ0213: { severity: "warning", meaning: "Import depth limit or cycle reached" },
  SQ0220: { severity: "warning", meaning: "Inline server action cannot be imported" },
  SQ0221: { severity: "warning", meaning: "Form data action needs review" },
  SQ0222: { severity: "warning", meaning: "Function with several parameters needs review" },
  SQ0230: { severity: "warning", meaning: "Endpoint input not understood" },
  SQ0231: { severity: "warning", meaning: "Function input not understood" },
  SQ0240: { severity: "warning", meaning: "Form field name is not a literal" },
  SQ0250: { severity: "warning", meaning: "Filter source not understood" },
  SQ0260: { severity: "warning", meaning: "File could not be parsed" },
  SQ0270: { severity: "warning", meaning: "Dynamic export pattern not understood" },
} as const satisfies Record<string, { severity: Diagnostic["severity"]; meaning: string }>;
/** Stable compiler diagnostic code. */
export type DiagnosticCode = keyof typeof diagnostics;
/** Build a manifest diagnostic from a registered code. */
export function diagnostic(
  code: DiagnosticCode,
  file?: string,
  line?: number,
  detail?: string,
): Diagnostic {
  const meaning = diagnostics[code].meaning;
  return {
    code,
    severity: diagnostics[code].severity,
    message: (detail ? `${meaning}: ${detail}` : meaning).slice(0, 300),
    ...(file ? { file } : {}),
    ...(file && line ? { line } : {}),
  };
}
