import {
  type CapabilityDecision,
  type DecisionsFile,
  type Manifest,
  parseDecisions,
} from "@speeq/core/manifest";
import type { ProjectFs } from "./fsx.js";

/** Failure with a stable code; the CLI maps codes to exit codes. */
export class IntegrateError extends Error {
  constructor(
    readonly code:
      | "unknown-id"
      | "unsupported"
      | "blocked"
      | "invalid-decisions"
      | "invalid-manifest",
    message: string,
  ) {
    super(message);
    this.name = "IntegrateError";
  }
}
/** Path of the developer-owned decisions file. */
export const decisionsPath = (prefix: string) => `${prefix}.speeq/decisions.json`;
/** Path of the scanner-owned manifest. */
export const manifestPath = (prefix: string) => `${prefix}.speeq/manifest.json`;

/** Stable text form: sorted ids, two-space indent, trailing newline. */
export function serializeDecisions(d: DecisionsFile): string {
  const sorted = Object.fromEntries(
    Object.entries(d.capabilities).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return `${JSON.stringify({ decisionsVersion: 1, capabilities: sorted }, null, 2)}\n`;
}
/** Read decisions. Missing file gives `undefined`; an invalid file is an error, never silently reset. */
export async function readDecisions(
  fs: ProjectFs,
  prefix: string,
): Promise<DecisionsFile | undefined> {
  const text = await fs.read(decisionsPath(prefix));
  if (text === undefined) return undefined;
  try {
    return parseDecisions(JSON.parse(text));
  } catch {
    throw new IntegrateError(
      "invalid-decisions",
      `${decisionsPath(prefix)} is not a valid decisions file.`,
    );
  }
}
/** Write decisions. Called only for an explicit developer operation. */
export async function writeDecisions(
  fs: ProjectFs,
  prefix: string,
  d: DecisionsFile,
): Promise<void> {
  await fs.write(decisionsPath(prefix), serializeDecisions(d));
}
/**
 * Record a developer decision. Approval stores the capability's current fingerprint. Refuses
 * unknown ids, unsupported capabilities and credentials. Pure: returns a new file.
 */
export function setDecision(
  decisions: DecisionsFile | undefined,
  manifest: Manifest,
  id: string,
  op: "enable" | "disable",
  extra: Partial<Omit<CapabilityDecision, "review" | "approvedFingerprint">> = {},
): DecisionsFile {
  const c = manifest.capabilities.find((x) => x.id === id);
  if (!c) throw new IntegrateError("unknown-id", `No capability ${id}.`);
  const prev = decisions?.capabilities[id];
  let next: CapabilityDecision;
  if (op === "enable") {
    if (c.support === "unsupported")
      throw new IntegrateError("unsupported", `${id} is not supported.`);
    if (c.sensitivity === "credentials")
      throw new IntegrateError("blocked", `${id} handles credentials and can never be enabled.`);
    next = { ...prev, ...extra, review: "approved", approvedFingerprint: c.fingerprint };
  } else {
    const { approvedFingerprint: _drop, ...rest } = prev ?? { review: "disabled" as const };
    next = { ...rest, ...extra, review: "disabled" };
  }
  return parseDecisions({
    decisionsVersion: 1,
    capabilities: { ...(decisions?.capabilities ?? {}), [id]: next },
  });
}
/** Write the scanner-owned manifest. Returns what happened. */
export async function writeManifest(
  fs: ProjectFs,
  prefix: string,
  manifest: Manifest,
): Promise<"created" | "updated" | "unchanged"> {
  const path = manifestPath(prefix);
  const text = `${JSON.stringify(manifest, null, 2)}
`;
  const current = await fs.read(path);
  if (current === text) return "unchanged";
  await fs.write(path, text);
  return current === undefined ? "created" : "updated";
}
