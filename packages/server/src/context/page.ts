import { type PageContext, redactPath, safeJsonStringify } from "@speeq/core";
import type { ResolvedConfig } from "../resolve.js";
import { exposeTree, project } from "./project.js";

/** Page-context policy after defaults. `null` = no `context.page` block (0.11 behaviour). */
export interface ResolvedPagePolicy {
  allow: ReadonlySet<string>;
  maxBytes: number;
  store: "keys" | "full" | "none";
}

let warnedLegacy = false;

/**
 * Cleans page context from the browser before anything uses it. The path always loses secret-like
 * query parameters. With a `context.page` block only allow-listed `data` keys pass, screened and
 * size-limited; without one, `data` passes screened (0.11 behaviour, with a one-time warning).
 */
export function sanitizePageContext(
  config: ResolvedConfig,
  input: PageContext | undefined,
): PageContext | undefined {
  if (!input) return undefined;
  const out: PageContext = { path: redactPath(input.path) };
  if (input.title) out.title = input.title;
  const data = input.data;
  if (!data || Object.keys(data).length === 0) return out;
  const policy = config.contextPage;
  if (!policy) {
    if (!warnedLegacy) {
      warnedLegacy = true;
      config.logger.warn(
        "Page context `data` is used without a `context.page.allow` list. Declare the keys the agent may see (see docs/reference/server-config.md); this fallback will be removed in a later version.",
      );
    }
    const screened = project(data, true).value as Record<string, unknown> | undefined;
    if (screened && Object.keys(screened).length) out.data = screened;
    return out;
  }
  const allowed = [...policy.allow].filter((k) => Object.hasOwn(data, k));
  const screened = (project(data, exposeTree(allowed)).value ?? {}) as Record<string, unknown>;
  // Keep keys in allow-list order until the byte budget is used.
  const kept: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in screened)) continue;
    kept[key] = screened[key];
    if (safeJsonStringify(kept).length > policy.maxBytes) delete kept[key];
  }
  if (Object.keys(kept).length) out.data = kept;
  return out;
}

/** What the conversation store keeps of an already sanitized page context. */
export function storedPageContext(
  config: ResolvedConfig,
  context: PageContext | undefined,
): PageContext | undefined {
  if (!context) return undefined;
  const mode = config.contextPage?.store ?? "full";
  if (mode === "none") return undefined;
  if (mode === "full" || !context.data) return context;
  // Keys only: the audit shows what the agent saw, not the values.
  return {
    ...context,
    data: Object.fromEntries(Object.keys(context.data).map((k) => [k, "[not stored]"])),
  };
}

/**
 * Page context for resuming after a confirmation or UI result, read back from the store. Values the
 * store did not keep are left out rather than shown to the model as placeholders.
 */
export function resumablePageContext(stored: PageContext | undefined): PageContext | undefined {
  if (!stored?.data) return stored;
  const data = Object.fromEntries(
    Object.entries(stored.data).filter(([, v]) => v !== "[not stored]"),
  );
  const { data: _omit, ...rest } = stored;
  return Object.keys(data).length ? { ...rest, data } : rest;
}
