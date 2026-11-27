import type { FileResult } from "./analyze.js";
import type { SourceProject } from "./ts/project.js";

/** Bump whenever extraction logic changes, so old caches are ignored. */
export const ANALYZER_VERSION = "1";
/** What the cache stores for one analyzed file. Opaque outside the compiler. */
export interface CachedFile {
  sha256: string;
  /** Files whose content influenced the result (including the file itself). */
  imports: string[];
  extraction: unknown;
}
/** Incremental scan state. The caller decides where to persist it. */
export interface ScanCache {
  analyzerVersion: string;
  appDir: string;
  files: Record<string, CachedFile>;
}
/** The shape stored inside `CachedFile.extraction`. */
export interface Extraction {
  result: FileResult;
  deps: Record<string, string>;
  resolutions: [string, string | null][];
}
function isExtraction(x: unknown): x is Extraction {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<Extraction>;
  return !!e.result && !!e.deps && Array.isArray(e.resolutions);
}
/**
 * Is a cached result still valid? The file and every file it read must have the same content, and
 * every import must still resolve to the same target.
 */
export async function validExtraction(
  file: string,
  entry: CachedFile | undefined,
  project: SourceProject,
): Promise<Extraction | undefined> {
  if (!entry || entry.sha256 !== (await project.sha(file)) || !isExtraction(entry.extraction))
    return;
  const ex = entry.extraction;
  for (const [dep, sha] of Object.entries(ex.deps)) if ((await project.sha(dep)) !== sha) return;
  for (const [key, target] of ex.resolutions) {
    const [from, spec] = key.split("\0");
    if (from === undefined || spec === undefined) return;
    if (project.resolve(from, spec) !== target) return;
  }
  return ex;
}
