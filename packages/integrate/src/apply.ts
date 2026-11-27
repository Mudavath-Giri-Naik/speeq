import ts from "typescript";
import type { ProjectFs } from "./fsx.js";
import { sha256 } from "./owned.js";
import type { IntegrationPlan, PlannedChange } from "./plan.js";

interface JournalFile {
  path: string;
  action: "create" | "update" | "append" | "delete";
  /** For `append`: length and hash of the appended block. Nothing else is stored. */
  appendedLength?: number;
  appendedHash?: string;
  /** Backup file name under the backup folder, for update and delete. */
  backup?: string;
  /** sha256 of the content speeq wrote; `undefined` for deletes. */
  afterHash?: string;
  /** Set once rollback has handled the file. */
  restored?: boolean;
}
interface Journal {
  version: 1;
  id: string;
  createdAt: string;
  state: "applying" | "applied" | "failed";
  files: JournalFile[];
}
/** Outcome of {@link applyPlan}. */
export type ApplyResult =
  | { status: "noop" }
  | { status: "conflict"; conflicts: string[] }
  | { status: "applied"; id: string; written: string[]; removed: string[] }
  | { status: "failed"; reason: string; restored: boolean };
/** Outcome of {@link rollback}. */
export type RollbackResult =
  | { status: "none" }
  | {
      status: "done" | "partial";
      id: string;
      restored: string[];
      removed: string[];
      skipped: { path: string; reason: string }[];
    };

const backupsDir = (prefix: string) => `${prefix}.speeq/backups`;
const stamp = (d: Date) => d.toISOString().replace(/[-:.]/g, "");

function syntaxError(path: string, content: string): string | undefined {
  if (!/\.tsx?$/.test(path)) return undefined;
  const r = ts.transpileModule(content, {
    reportDiagnostics: true,
    fileName: path,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  });
  const d = r.diagnostics?.[0];
  return d ? `${path}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}` : undefined;
}
const writable = (c: PlannedChange) => c.action !== "keep";

/**
 * Apply a plan. Stops before writing anything if a file was edited by hand or generated source
 * does not parse. Before the first write it records a journal and a backup of every touched
 * file; a failure part-way restores them. Never touches files outside the plan.
 */
export async function applyPlan(
  fs: ProjectFs,
  plan: IntegrationPlan,
  options: { now?: () => Date } = {},
): Promise<ApplyResult> {
  if (plan.conflicts.length) return { status: "conflict", conflicts: plan.conflicts };
  const todo = plan.changes.filter(writable);
  if (todo.length === 0) return { status: "noop" };
  for (const c of todo) {
    if (c.content === undefined && c.action !== "delete")
      return { status: "failed", reason: `${c.path}: no content`, restored: false };
    const bad = c.content === undefined ? undefined : syntaxError(c.path, c.content);
    if (bad) return { status: "failed", reason: bad, restored: false };
  }
  const now = options.now ?? (() => new Date());
  const id = stamp(now());
  const dir = `${backupsDir(plan.prefix)}/${id}`;
  const journal: Journal = {
    version: 1,
    id,
    createdAt: now().toISOString(),
    state: "applying",
    files: [],
  };
  const saveJournal = () =>
    fs.write(`${dir}/journal.json`, `${JSON.stringify(journal, null, 2)}\n`);
  try {
    let n = 0;
    for (const c of todo) {
      const entry: JournalFile = { path: c.path, action: c.action as JournalFile["action"] };
      const before = await fs.read(c.path);
      if (c.action === "append") {
        // Appends never copy the file: it may hold keys. Rollback removes exactly the appended block.
        if (before === undefined)
          return {
            status: "failed",
            reason: `${c.path} disappeared before apply`,
            restored: false,
          };
        entry.appendedLength = (c.content as string).length;
        entry.appendedHash = sha256(c.content as string);
        journal.files.push(entry);
        continue;
      }
      if (before !== undefined) {
        entry.backup = `files/${n++}`;
        await fs.write(`${dir}/${entry.backup}`, before);
      } else if (c.action !== "create") {
        return { status: "failed", reason: `${c.path} disappeared before apply`, restored: false };
      }
      if (c.content !== undefined) entry.afterHash = sha256(c.content);
      journal.files.push(entry);
    }
    await saveJournal();
    const written: string[] = [];
    const removed: string[] = [];
    for (const c of todo) {
      if (c.action === "delete") {
        await fs.remove(c.path);
        removed.push(c.path);
      } else if (c.action === "append") {
        const current = (await fs.read(c.path)) ?? "";
        await fs.write(c.path, current + (c.content as string));
        written.push(c.path);
      } else {
        await fs.write(c.path, c.content as string);
        written.push(c.path);
      }
    }
    journal.state = "applied";
    await saveJournal();
    return { status: "applied", id, written, removed };
  } catch (error) {
    journal.state = "failed";
    const restored = await restore(fs, dir, journal, false)
      .then(() => true)
      .catch(() => false);
    await fs.removeTree(dir).catch(() => {});
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "apply failed",
      restored,
    };
  }
}
/** Restore recorded files. With `checkHash`, files changed since apply are skipped. */
async function restore(fs: ProjectFs, dir: string, journal: Journal, checkHash: boolean) {
  const restored: string[] = [];
  const removed: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const f of [...journal.files].reverse()) {
    if (f.restored) continue;
    const current = await fs.read(f.path);
    if (
      checkHash &&
      f.afterHash !== undefined &&
      current !== undefined &&
      sha256(current) !== f.afterHash
    ) {
      skipped.push({ path: f.path, reason: "Changed since speeq wrote it; left as is." });
      continue;
    }
    if (f.action === "append") {
      const n = f.appendedLength ?? 0;
      if (
        current === undefined ||
        n === 0 ||
        current.length < n ||
        sha256(current.slice(-n)) !== f.appendedHash
      ) {
        skipped.push({ path: f.path, reason: "Changed since speeq wrote it; left as is." });
        continue;
      }
      await fs.write(f.path, current.slice(0, current.length - n));
      restored.push(f.path);
    } else if (f.action === "create") {
      if (current !== undefined) await fs.remove(f.path);
      removed.push(f.path);
    } else if (f.backup) {
      const before = await fs.read(`${dir}/${f.backup}`);
      if (before === undefined) {
        skipped.push({ path: f.path, reason: "Backup is missing." });
        continue;
      }
      await fs.write(f.path, before);
      restored.push(f.path);
    }
    f.restored = true;
  }
  return { restored, removed, skipped };
}
/**
 * Undo the most recent applied run. Restores only files recorded in its journal, and only when
 * their content still matches what speeq wrote. Uses no version control.
 */
export async function rollback(
  fs: ProjectFs,
  prefix: string,
  options: { id?: string } = {},
): Promise<RollbackResult> {
  const ids = (await fs.list(backupsDir(prefix))).sort().reverse();
  for (const id of options.id ? [options.id] : ids) {
    const dir = `${backupsDir(prefix)}/${id}`;
    const text = await fs.read(`${dir}/journal.json`);
    if (!text) continue;
    let journal: Journal;
    try {
      journal = JSON.parse(text) as Journal;
    } catch {
      continue;
    }
    if (journal.state !== "applied" || journal.files.every((f) => f.restored)) continue;
    const r = await restore(fs, dir, journal, true);
    if (r.skipped.length === 0) {
      await fs.removeTree(dir);
      return { status: "done", id, ...r };
    }
    await fs.write(`${dir}/journal.json`, `${JSON.stringify(journal, null, 2)}\n`);
    return { status: "partial", id, ...r };
  }
  return { status: "none" };
}
/** What {@link rollback} would do, without changing anything. */
export async function previewRollback(
  fs: ProjectFs,
  prefix: string,
): Promise<
  | {
      id: string;
      files: { path: string; action: "restore" | "remove" | "skip"; reason?: string }[];
    }
  | undefined
> {
  for (const id of (await fs.list(backupsDir(prefix))).sort().reverse()) {
    const text = await fs.read(`${backupsDir(prefix)}/${id}/journal.json`);
    if (!text) continue;
    let journal: Journal;
    try {
      journal = JSON.parse(text) as Journal;
    } catch {
      continue;
    }
    if (journal.state !== "applied" || journal.files.every((f) => f.restored)) continue;
    const files: { path: string; action: "restore" | "remove" | "skip"; reason?: string }[] = [];
    for (const f of [...journal.files].reverse()) {
      if (f.restored) continue;
      const current = await fs.read(f.path);
      if (f.afterHash !== undefined && current !== undefined && sha256(current) !== f.afterHash)
        files.push({ path: f.path, action: "skip", reason: "Changed since speeq wrote it." });
      else files.push({ path: f.path, action: f.action === "create" ? "remove" : "restore" });
    }
    return { id, files };
  }
  return undefined;
}
