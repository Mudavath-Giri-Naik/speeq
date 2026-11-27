import type { CapabilityDecision } from "@speeq/core/manifest";
import { IntegrateError, reviewState, setDecision, writeDecisions } from "@speeq/integrate";
import pc from "picocolors";
import { load } from "../load.js";
import { CliExit, type Ctx, EXIT } from "../types.js";

const ACCESS = new Set(["read", "write"]);
const AUTH = new Set(["public", "authenticated", "roles"]);

function decisionFromFlags(ctx: Ctx): Partial<CapabilityDecision> {
  const f = ctx.flags;
  const extra: Partial<CapabilityDecision> = {};
  if (f.access) {
    if (!ACCESS.has(f.access))
      throw new CliExit(EXIT.usage, "--access must be read or write.", "usage");
    extra.access = f.access as "read" | "write";
  }
  if (f.auth) {
    if (!AUTH.has(f.auth))
      throw new CliExit(EXIT.usage, "--auth must be public, authenticated or roles.", "usage");
    const roles = f.roles
      ?.split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (f.auth === "roles" && !roles?.length)
      throw new CliExit(EXIT.usage, "--auth roles needs --roles a,b.", "usage");
    extra.auth = {
      requirement: f.auth as "public" | "authenticated" | "roles",
      ...(f.auth === "roles" ? { roles } : {}),
    };
  }
  if (f.forwardAuth) extra.forwardAuth = true;
  if (f.noConfirm) extra.confirm = false;
  if (f.name) extra.name = f.name;
  return extra;
}
/** `speeq capabilities list|show|enable|disable`. */
export async function capabilities(ctx: Ctx): Promise<number> {
  const [sub = "list", id] = ctx.args;
  if (!["list", "show", "enable", "disable"].includes(sub))
    throw new CliExit(
      EXIT.usage,
      `Unknown subcommand "${sub}". Use list, show, enable or disable.`,
      "usage",
    );
  const loaded = await load(ctx);
  const state = reviewState(loaded.manifest, loaded.decisions);
  if (sub === "list") {
    const rows = state.entries
      .map((e) => {
        const c = loaded.manifest.capabilities.find((x) => x.id === e.id);
        return {
          id: e.id,
          kind: c?.kind ?? "",
          support: e.status.support,
          access: c?.access ?? "",
          status: e.status.headline,
        };
      })
      .filter(
        (r) =>
          (!ctx.flags.kind || r.kind === ctx.flags.kind) &&
          (!ctx.flags.status || r.status === ctx.flags.status),
      );
    for (const r of rows)
      ctx.say(`${r.status.padEnd(12)} ${r.kind.padEnd(10)} ${pc.dim(r.access.padEnd(8))} ${r.id}`);
    return ctx.finish(EXIT.ok, { capabilities: rows });
  }
  if (!id) throw new CliExit(EXIT.usage, `capabilities ${sub} needs a capability id.`, "usage");
  const cap = loaded.manifest.capabilities.find((c) => c.id === id);
  if (!cap)
    throw new CliExit(
      EXIT.usage,
      `No capability ${id}. Run "speeq capabilities list".`,
      "unknown-id",
    );
  if (sub === "show") {
    const entry = state.entries.find((e) => e.id === id);
    ctx.say(
      `${pc.bold(cap.id)}\n  ${cap.title}\n  support ${cap.support}${cap.supportReason ? ` (${cap.supportReason})` : ""}, access ${cap.access}, sensitivity ${cap.sensitivity}`,
    );
    for (const ev of cap.evidence)
      ctx.say(pc.dim(`  evidence: ${ev.file}:${ev.line} ${ev.detector}`));
    ctx.say(
      `  status ${entry?.status.headline}${entry?.decision ? `, decision ${JSON.stringify(entry.decision)}` : ""}`,
    );
    return ctx.finish(EXIT.ok, {
      capability: cap,
      status: entry?.status,
      decision: entry?.decision ?? null,
    });
  }
  try {
    const next = setDecision(
      loaded.decisions,
      loaded.manifest,
      id,
      sub as "enable" | "disable",
      decisionFromFlags(ctx),
    );
    if (!ctx.flags.dryRun) await writeDecisions(loaded.fs, loaded.prefix, next);
    ctx.say(
      `${sub === "enable" ? "Approved" : "Disabled"} ${id}${ctx.flags.dryRun ? " (dry run, nothing written)" : ". Run `speeq upgrade` to regenerate."}`,
    );
    return ctx.finish(EXIT.ok, {
      id,
      review: next.capabilities[id]?.review,
      written: !ctx.flags.dryRun,
    });
  } catch (e) {
    if (e instanceof IntegrateError)
      throw new CliExit(
        e.code === "unsupported" || e.code === "blocked" ? EXIT.unsupported : EXIT.usage,
        e.message,
        e.code,
      );
    throw e;
  }
}
