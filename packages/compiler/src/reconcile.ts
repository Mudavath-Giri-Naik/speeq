import {
  type CapabilityDecision,
  type CapabilityStatus,
  type DecisionsFile,
  type Manifest,
  resolveStatus,
  type StatusContext,
} from "@speeq/core/manifest";

/** How the current manifest and the developer's decisions line up. Pure: nothing is written. */
export interface Reconciliation {
  /** One entry per manifest capability, sorted by id. */
  entries: { id: string; decision?: CapabilityDecision; status: CapabilityStatus }[];
  /** Capabilities with no decision yet. */
  newCapabilities: string[];
  /** Approved decisions whose fingerprint no longer matches. */
  stale: string[];
  /** Decisions with no capability, not explained by a move. */
  orphaned: string[];
  /** A function that moved: exactly one orphaned approval and one new function match by name and fingerprint. */
  moved: { from: string; to: string }[];
  invalidDecisions: { id: string; reason: string }[];
}
const DEFAULT_CONTEXT: StatusContext = { binding: "none", verification: "unverified" };
function exportName(id: string) {
  return id.slice(id.indexOf("#") + 1);
}
/** Merge a manifest with decisions. Never approves anything on the developer's behalf. */
export function reconcile(
  manifest: Manifest,
  decisions: DecisionsFile | undefined,
  context: (id: string) => StatusContext = () => DEFAULT_CONTEXT,
): Reconciliation {
  const decided = decisions?.capabilities ?? {};
  const entries: Reconciliation["entries"] = [];
  const newCapabilities: string[] = [],
    stale: string[] = [],
    invalidDecisions: Reconciliation["invalidDecisions"] = [];
  const ids = new Set<string>();
  for (const c of manifest.capabilities) {
    ids.add(c.id);
    const decision = decided[c.id];
    const status = resolveStatus(c, decision, context(c.id));
    entries.push({ id: c.id, ...(decision ? { decision } : {}), status });
    if (!decision) newCapabilities.push(c.id);
    if (decision?.review === "approved") {
      if (status.freshness === "stale") stale.push(c.id);
      if (!decision.approvedFingerprint)
        invalidDecisions.push({ id: c.id, reason: "Approval has no fingerprint." });
      if (c.access === "unknown" && !decision.access)
        invalidDecisions.push({
          id: c.id,
          reason: "Access must be set for an unknown access level.",
        });
    }
  }
  const orphans = Object.keys(decided)
    .filter((id) => !ids.has(id))
    .sort();
  const moved: Reconciliation["moved"] = [];
  const claimedTargets = new Set<string>();
  const functions = manifest.capabilities.filter((c) => c.kind === "function" && !decided[c.id]);
  for (const from of orphans) {
    const d = decided[from];
    if (!from.startsWith("function:") || d?.review !== "approved" || !d.approvedFingerprint)
      continue;
    const targets = functions.filter(
      (c) => c.fingerprint === d.approvedFingerprint && exportName(c.id) === exportName(from),
    );
    const rivals = orphans.filter((o) => {
      const od = decided[o];
      return (
        o.startsWith("function:") &&
        od?.approvedFingerprint === d.approvedFingerprint &&
        exportName(o) === exportName(from)
      );
    });
    const [to] = targets;
    if (targets.length === 1 && rivals.length === 1 && to && !claimedTargets.has(to.id)) {
      claimedTargets.add(to.id);
      moved.push({ from, to: to.id });
    }
  }
  const movedFrom = new Set(moved.map((m) => m.from));
  return {
    entries,
    newCapabilities,
    stale,
    orphaned: orphans.filter((o) => !movedFrom.has(o)),
    moved,
    invalidDecisions,
  };
}
