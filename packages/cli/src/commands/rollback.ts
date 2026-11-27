import { previewRollback, rollback as rollbackRun } from "@speeq/integrate";
import pc from "picocolors";
import { load } from "../load.js";
import { CliExit, type Ctx, EXIT } from "../types.js";

/** `speeq rollback`: undo the last apply. Restores only files speeq wrote and that are unchanged since. */
export async function rollbackCommand(ctx: Ctx): Promise<number> {
  const loaded = await load(ctx);
  if (ctx.flags.dryRun) {
    const preview = await previewRollback(loaded.fs, loaded.prefix);
    if (!preview) throw new CliExit(EXIT.failure, "Nothing to roll back.", "nothing-to-roll-back");
    for (const f of preview.files)
      ctx.say(`  ${f.action.padEnd(8)} ${f.path}${f.reason ? pc.dim(`  (${f.reason})`) : ""}`);
    return ctx.finish(EXIT.ok, { id: preview.id, files: preview.files, applied: false });
  }
  const r = await rollbackRun(loaded.fs, loaded.prefix);
  if (r.status === "none")
    throw new CliExit(EXIT.failure, "Nothing to roll back.", "nothing-to-roll-back");
  for (const p of r.restored) ctx.say(`  restored ${p}`);
  for (const p of r.removed) ctx.say(`  removed  ${p}`);
  for (const s of r.skipped) ctx.say(pc.yellow(`  skipped  ${s.path}: ${s.reason}`));
  if (r.status === "partial") {
    throw new CliExit(
      EXIT.failure,
      "Some files changed after speeq wrote them and were left as they are.",
      "partial",
      {
        id: r.id,
        restored: r.restored,
        removed: r.removed,
        skipped: r.skipped,
      },
    );
  }
  ctx.say(pc.green("Rolled back."));
  return ctx.finish(EXIT.ok, {
    id: r.id,
    restored: r.restored,
    removed: r.removed,
    skipped: r.skipped,
  });
}
