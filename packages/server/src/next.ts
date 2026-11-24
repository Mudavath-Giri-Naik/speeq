/**
 * `@speeq/server/next`: Next.js App Router adapter.
 *
 * ```ts
 * // app/api/speeq/[[...speeq]]/route.ts
 * import { createNextHandler } from "@speeq/server/next";
 * import { speeq } from "@/lib/speeq";
 * export const runtime = "nodejs";
 * export const { GET, POST, OPTIONS } = createNextHandler(speeq);
 * ```
 * @packageDocumentation
 */
import type { Speeq } from "./index.js";

/** A Next.js route handler (the second `context` argument is accepted and ignored). */
export type NextRouteHandler = (request: Request, context?: unknown) => Promise<Response>;

/** Route handlers for a Next.js catch-all route. They are the same web-standard handler. */
export interface NextHandlers {
  GET: NextRouteHandler;
  POST: NextRouteHandler;
  OPTIONS: NextRouteHandler;
}

/** Exposes a speeq instance as Next.js App Router route handlers. */
export function createNextHandler(speeq: Speeq): NextHandlers {
  const handle: NextRouteHandler = (request) => speeq.handler(request);
  return { GET: handle, POST: handle, OPTIONS: handle };
}
