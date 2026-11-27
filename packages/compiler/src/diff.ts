import type { Manifest } from "@speeq/core/manifest";

/** Capability ids that differ between two manifests. */
export interface ManifestDiff {
  added: string[];
  removed: string[];
  /** Same id, different fingerprint. */
  changed: string[];
  unchanged: number;
}
/** Compare two manifests by id and fingerprint. A missing `before` means everything is added. */
export function diffManifests(before: Manifest | undefined, after: Manifest): ManifestDiff {
  const prior = new Map((before?.capabilities ?? []).map((c) => [c.id, c.fingerprint]));
  const added: string[] = [],
    changed: string[] = [];
  let unchanged = 0;
  for (const c of after.capabilities) {
    const f = prior.get(c.id);
    if (f === undefined) added.push(c.id);
    else if (f !== c.fingerprint) changed.push(c.id);
    else unchanged++;
    prior.delete(c.id);
  }
  return { added, removed: [...prior.keys()].sort(), changed, unchanged };
}
