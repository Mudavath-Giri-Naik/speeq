import type { CapabilityDecision, DecisionsFile } from "@speeq/core/manifest";
import { reviewState, setDecision, writeDecisions } from "@speeq/integrate";
import type { Ctx, Loaded } from "./types.js";

/** Kinds that become tools or routes. Forms are offered separately; filters ride on their route. */
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
  const chosen =
    pending.length === 0
      ? []
      : await prompts.multiselect(
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
  // Forms are offered separately: filling is draft-only, so nothing is submitted or changed.
  const forms = state.entries
    .filter((e) => {
      const c = byId.get(e.id);
      return (
        c?.kind === "form" &&
        !e.decision &&
        !e.status.blocked &&
        e.status.support !== "unsupported" &&
        c.fields.some((f) => !f.sensitive)
      );
    })
    .map((e) => e.id);
  if (forms.length) {
    const fill = await prompts.multiselect(
      "Which forms may the assistant fill as a draft? (it never submits them)",
      forms.map((id) => {
        const c = byId.get(id);
        const names =
          c?.kind === "form" ? c.fields.filter((f) => !f.sensitive).map((f) => f.name) : [];
        return { value: id, label: id, hint: names.slice(0, 5).join(", ") };
      }),
      [],
    );
    for (const id of fill) decisions = setDecision(decisions, loaded.manifest, id, "enable", {});
  }
  if (decisions && decisions !== loaded.decisions && !ctx.flags.dryRun)
    await writeDecisions(loaded.fs, loaded.prefix, decisions);
  return decisions;
}
