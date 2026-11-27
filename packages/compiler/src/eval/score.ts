import { kindSchema, resolveStatus } from "@speeq/core/manifest";
import type { DiscoveryResult } from "../adapter.js";
import type { GroundTruth } from "./ground-truth.js";
/** Compare discovery identities, evidence and effective policy with fixture labels. */
export function score(truth: GroundTruth, result: DiscoveryResult) {
  const perKind = kindSchema.options.map((kind) => {
    const expected = new Set(truth.capabilities.filter((c) => c.kind === kind).map((c) => c.id));
    const matched = new Set<string>();
    const falsePositives: string[] = [];
    for (const c of result.capabilities.filter((c) => c.kind === kind)) {
      if (!expected.has(c.id) || matched.has(c.id)) falsePositives.push(c.id);
      else matched.add(c.id);
    }
    const falseNegatives = [...expected].filter((id) => !matched.has(id));
    const found = matched.size + falsePositives.length;
    return {
      kind,
      precision: found ? matched.size / found : 1,
      recall: expected.size ? matched.size / expected.size : 1,
      falsePositives,
      falseNegatives,
    };
  });
  const forbidden = result.capabilities
    .filter((c) => truth.forbidden.includes(c.id))
    .map((c) => c.id);
  const missingUnsupported = truth.unsupported.filter(
    (u) => !result.diagnostics.some((d) => d.file === u.file && d.code === u.code),
  );
  const evidenceMismatch: string[] = [],
    executableMismatch: string[] = [],
    classificationMismatch: string[] = [];
  const expected = new Map(truth.capabilities.map((c) => [c.id, c]));
  for (const c of result.capabilities) {
    const e = expected.get(c.id);
    if (!e) continue;
    if (
      !c.evidence.length ||
      !c.evidence.every((actual) =>
        e.evidence.some((label) => label.file === actual.file && label.line === actual.line),
      )
    )
      evidenceMismatch.push(c.id);
    if (c.support !== e.support || c.access !== e.access) classificationMismatch.push(c.id);
    const status = resolveStatus(
      c,
      { review: "approved", approvedFingerprint: c.fingerprint },
      { binding: "bound", verification: "unverified" },
    );
    if (status.executable !== e.executableWhenApproved) executableMismatch.push(c.id);
  }
  const passed =
    perKind.every((k) => !k.falseNegatives.length && !k.falsePositives.length) &&
    ![
      forbidden,
      missingUnsupported,
      evidenceMismatch,
      executableMismatch,
      classificationMismatch,
    ].some((v) => v.length);
  return {
    fixture: truth.fixture,
    supported: truth.supported,
    perKind,
    forbidden,
    unsupportedReported: !missingUnsupported.length,
    missingUnsupported,
    evidenceMismatch,
    executableMismatch,
    classificationMismatch,
    passed,
  };
}
