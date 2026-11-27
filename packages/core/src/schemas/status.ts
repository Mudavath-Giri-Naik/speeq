import type { Capability, CapabilityDecision, Support } from "./manifest.js";
/** Runtime binding and verification observed by the caller. */
export interface StatusContext {
  binding: "none" | "bound";
  verification: "unverified" | "verified" | "failed";
}
/** Independent review, policy and runtime dimensions. */
export interface CapabilityStatus extends StatusContext {
  support: Support;
  review: "pending" | "approved" | "disabled";
  blocked: false | { reason: "credentials" | "sensitive-not-allowed" };
  freshness: "current" | "stale";
  executable: boolean;
  headline:
    | "executable"
    | "stale"
    | "blocked"
    | "unsupported"
    | "disabled"
    | "needs-review"
    | "pending";
}
/** Resolve effective policy per ADR-0015. Verification is reported independently. */
export function resolveStatus(
  c: Capability,
  d: CapabilityDecision | undefined,
  ctx: StatusContext,
): CapabilityStatus {
  const review = d?.review ?? "pending";
  const freshness =
    review === "approved" && d?.approvedFingerprint !== c.fingerprint ? "stale" : "current";
  let blocked: CapabilityStatus["blocked"] = false;
  if (c.sensitivity === "credentials") blocked = { reason: "credentials" };
  else if ((c.sensitivity === "admin" || c.sensitivity === "financial") && !d?.allowSensitive)
    blocked = { reason: "sensitive-not-allowed" };
  const executable =
    review === "approved" &&
    freshness === "current" &&
    !blocked &&
    c.support !== "unsupported" &&
    ctx.binding === "bound" &&
    (c.access !== "unknown" || d?.access !== undefined);
  const headline = executable
    ? "executable"
    : freshness === "stale"
      ? "stale"
      : blocked
        ? "blocked"
        : c.support === "unsupported"
          ? "unsupported"
          : review === "disabled"
            ? "disabled"
            : c.support === "needs-review"
              ? "needs-review"
              : "pending";
  return { ...ctx, support: c.support, review, blocked, freshness, executable, headline };
}
