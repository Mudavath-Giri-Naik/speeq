import { type ProviderKind, SpeeqError } from "@speeq/core";
import type { SpeechConfig } from "../config.js";

type Provider = { id: string; kind: ProviderKind };

/** Resolve one listed chain and explain each exclusion. */
export function selectProviders<T extends Provider>(
  providers: readonly T[],
  routing: Record<string, readonly string[]> = {},
  policy: SpeechConfig["policy"] = {},
  language = "default",
) {
  const routes = new Map(Object.entries(routing).map(([k, v]) => [k.toLowerCase(), v]));
  const tag = language.toLowerCase();
  const listed =
    routes.get(tag) ?? routes.get(tag.split("-")[0] ?? tag) ?? routes.get("default") ?? [];
  const usable: T[] = [];
  const skipped = new Map<string, "not-listed" | "remote-disallowed" | "paid-disallowed">();
  const byId = new Map(providers.map((p) => [p.id, p]));
  for (const p of providers) if (!listed.includes(p.id)) skipped.set(p.id, "not-listed");
  for (const id of new Set(listed)) {
    const p = byId.get(id);
    if (!p) continue;
    if (p.kind !== "self-hosted" && !policy.allowRemote) skipped.set(id, "remote-disallowed");
    else if (p.kind === "remote-paid" && !policy.allowPaid) skipped.set(id, "paid-disallowed");
    else usable.push(p);
  }
  return { usable, skipped };
}
/** Reject ambiguous identifiers and dangling routes before serving a request. */
export function validateSpeech(config: SpeechConfig) {
  const ids = new Set<string>();
  for (const type of ["stt", "tts"] as const) {
    const list = config[type] ?? [];
    for (const p of list) {
      if (ids.has(p.id))
        throw new SpeeqError("NOT_CONFIGURED", { message: "Duplicate speech provider id." });
      ids.add(p.id);
    }
    for (const chain of Object.values(config.routing?.[type] ?? {}))
      if (chain.some((id) => !list.some((p) => p.id === id)))
        throw new SpeeqError("NOT_CONFIGURED", {
          message: "Speech routing references an unknown provider.",
        });
  }
  for (const value of Object.values(config.limits ?? {}))
    if (!Number.isFinite(value) || value <= 0)
      throw new SpeeqError("NOT_CONFIGURED", {
        message: "Speech limits must be positive finite numbers.",
      });
}
