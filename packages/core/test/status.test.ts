import { type CapabilityDecision, type RouteCapability, resolveStatus } from "@speeq/core/manifest";
import { expect, it } from "vitest";

const route: RouteCapability = {
  id: "route:/",
  kind: "route",
  framework: "nextjs-pages",
  path: "/",
  pathPattern: "/",
  dynamic: "static",
  pathParams: [],
  queryParams: [],
  source: { file: "pages/index.tsx", line: 1 },
  evidence: [],
  auth: { observed: "unknown", evidence: [] },
  related: [],
  fingerprint: "a".repeat(64),
  title: "Home",
  support: "proven",
  access: "read",
  sensitivity: "none",
};
it("enforces ADR-0015 across review, support, policy and runtime dimensions", () => {
  for (const support of ["proven", "needs-review", "unsupported"] as const)
    for (const review of ["approved", "pending", "disabled"] as const)
      for (const match of [true, false])
        for (const access of ["read", "write", "unknown"] as const)
          for (const override of [undefined, "read", "write"] as const)
            for (const sensitivity of [
              "none",
              "personal",
              "unknown",
              "credentials",
              "admin",
              "financial",
            ] as const)
              for (const allowSensitive of [true, false])
                for (const binding of ["none", "bound"] as const)
                  for (const verification of ["unverified", "failed", "verified"] as const) {
                    const d: CapabilityDecision | undefined =
                      review === "pending"
                        ? undefined
                        : {
                            review,
                            approvedFingerprint: match ? route.fingerprint : "b".repeat(64),
                            access: override,
                            allowSensitive,
                          };
                    const s = resolveStatus({ ...route, access, sensitivity, support }, d, {
                      binding,
                      verification,
                    });
                    const blocked =
                      sensitivity === "credentials" ||
                      (["admin", "financial"].includes(sensitivity) && !d?.allowSensitive);
                    const executable =
                      review === "approved" &&
                      match &&
                      support !== "unsupported" &&
                      !blocked &&
                      binding === "bound" &&
                      (access !== "unknown" || !!override);
                    if (
                      s.executable !== executable ||
                      Boolean(s.blocked) !== blocked ||
                      (s.freshness === "stale") !== (review === "approved" && !match) ||
                      s.review !== review ||
                      s.binding !== binding ||
                      s.verification !== verification ||
                      s.support !== support ||
                      (s.headline === "executable") !== executable
                    )
                      expect.fail(
                        JSON.stringify({ s, d, access, sensitivity, support, executable }),
                      );
                  }
});
