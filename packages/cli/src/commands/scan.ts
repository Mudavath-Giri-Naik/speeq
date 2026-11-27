import { reviewState, writeManifest } from "@speeq/integrate";
import pc from "picocolors";
import { load } from "../load.js";
import { type Ctx, EXIT } from "../types.js";

function tally<T>(items: T[], key: (item: T) => string) {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}
/** `speeq scan`: rediscover capabilities and refresh the scanner-owned manifest. */
export async function scanCommand(ctx: Ctx): Promise<number> {
  const loaded = await load(ctx);
  const m = loaded.manifest;
  const state = reviewState(m, loaded.decisions);
  const manifest = ctx.flags.dryRun ? "dry-run" : await writeManifest(loaded.fs, loaded.prefix, m);
  const byKind = tally(m.capabilities, (c) => c.kind);
  const bySupport = tally(m.capabilities, (c) => c.support);
  const byStatus = tally(state.entries, (e) => e.status.headline);
  ctx.say(pc.bold(`${m.capabilities.length} capabilities`));
  ctx.say(`  kinds: ${JSON.stringify(byKind)}`);
  ctx.say(`  support: ${JSON.stringify(bySupport)}`);
  ctx.say(`  status: ${JSON.stringify(byStatus)}`);
  ctx.say(`  diagnostics: ${loaded.diagnostics}   manifest: ${manifest}`);
  if (state.stale.length) ctx.say(pc.yellow(`  stale approvals: ${state.stale.join(", ")}`));
  const review = state.stale.length > 0 || state.pending.length > 0;
  return ctx.finish(review && !ctx.interactive ? EXIT.needsReview : EXIT.ok, {
    manifest,
    counts: {
      capabilities: m.capabilities.length,
      byKind,
      bySupport,
      byStatus,
      diagnostics: loaded.diagnostics,
    },
    pending: state.pending,
    stale: state.stale,
    moved: state.moved,
    orphaned: state.orphaned,
  });
}
