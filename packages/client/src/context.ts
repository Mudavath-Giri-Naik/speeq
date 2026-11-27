import { redactPath } from "@speeq/core/utils";
import type { PageContextInput, SpeeqClientOptions } from "./types.js";

/** Collects page metadata only when a request needs it. */
export function pageContext(getContext: SpeeqClientOptions["getContext"]) {
  let context: PageContextInput = {};
  if (typeof location !== "undefined") context.path = location.pathname + location.search;
  if (typeof document !== "undefined") context.title = document.title;
  try {
    context = { ...context, ...getContext?.() };
  } catch (error) {
    console.error("[speeq] getContext threw", error);
  }
  // Reset links, magic links and OAuth callbacks carry secrets in the query: never send them.
  return context.path ? { ...context, path: redactPath(context.path) } : undefined;
}
