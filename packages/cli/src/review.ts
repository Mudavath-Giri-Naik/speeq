import type { CapabilityDecision, DecisionsFile } from "@speeq/core/manifest";
import { reviewState, setDecision, writeDecisions } from "@speeq/integrate";
import type { Ctx, Loaded } from "./types.js";

/** Kinds that become tools or routes. Forms and filters are only reported. */
const REVIEWABLE = new Set(["route", "endpoint", "function"]);

/**
 * Walk the developer through pending capabilities. Nothing is approved unless it is selected;
 * proven read-only routes start selected because navigation exposes no data. Writes
 * decisions.json (the developer's file) and returns the new decisions.
 */
export async function reviewPending(ctx: Ctx, loaded: Loaded): Promise<DecisionsFile | undefined> {
  const prompts = ctx.env.prompts;
  if (!prompts) return loaded.decisions;
  const state = reviewState(loaded.manifest, loaded.decisions);
  const byId = new Map(loaded.manifest.capabilities.map((c) => [c.id, c]));
  const pending = state.pending.filter((id) => REVIEWABLE.has(byId.get(id)?.kind ?? ""));
  if (pending.length === 0) return loaded.decisions;
  const chosen = await prompts.multiselect(
    "Which capabilities may the assistant use?",
    pending.map((id) => {
      const c = byId.get(id);
      return { value: id, label: id, hint: `${c?.support ?? ""}, ${c?.access ?? ""}` };
    }),
    pending.filter((id) => {
      const c = byId.get(id);
      return c?.kind === "route" && c.support === "proven";
    }),
  );
  let decisions = loaded.decisions;
  for (const id of chosen) {
    const c = byId.get(id);
    if (!c) continue;
    const extra: Partial<CapabilityDecision> = {};
    if (c.kind === "function" || c.kind === "endpoint") {
      if (c.access === "unknown")
        extra.access = await prompts.select<"read" | "write">(
          `${id}: does it read or change data?`,
          [
            { value: "read", label: "Reads data" },
            { value: "write", label: "Changes data (asks the user to confirm)" },
          ],
        );
      const requirement = await prompts.select(`${id}: who may use it?`, [
        { value: "authenticated", label: "Signed-in users" },
        { value: "roles", label: "Users with a role" },
        { value: "public", label: "Anyone" },
      ]);
      extra.auth = { requirement };
      if (requirement === "roles") {
        const roles = (await prompts.text("Roles (comma separated)"))
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
        extra.auth = { requirement, roles };
      }
      if (c.kind === "endpoint")
        extra.forwardAuth = await prompts.confirm(
          `${id}: forward the user's cookie and authorization header to it?`,
          false,
        );
    }
    decisions = setDecision(decisions, loaded.manifest, id, "enable", extra);
  }
  if (decisions && decisions !== loaded.decisions && !ctx.flags.dryRun)
    await writeDecisions(loaded.fs, loaded.prefix, decisions);
  return decisions;
}
