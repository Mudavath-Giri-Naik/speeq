import { SpeeqError, toPublicError, toSpeeqError } from "@speeq/core";
import type { z } from "zod";

/** A JSON response with no-store caching. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

/** A JSON error response. Uses the public form of the error: no raw messages or stacks. */
export function errorResponse(error: unknown, headers: Record<string, string> = {}): Response {
  const pub = toPublicError(error);
  const status = toSpeeqError(error).status;
  const extra: Record<string, string> = { ...headers };
  if (pub.retryAfterMs !== undefined)
    extra["retry-after"] = String(Math.ceil(pub.retryAfterMs / 1000));
  return json({ error: pub }, status, extra);
}

/**
 * Reads and validates a JSON body, refusing bodies over `maxBytes` (checked on the declared
 * length and on the bytes actually read). An empty body counts as `{}`.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes: number,
): Promise<z.output<S>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw tooLarge();
  const text = await readLimited(request, maxBytes);
  let value: unknown = {};
  if (text.trim()) {
    try {
      value = JSON.parse(text);
    } catch {
      throw new SpeeqError("INVALID_INPUT", { message: "Body must be valid JSON." });
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new SpeeqError("INVALID_INPUT", {
      message: first
        ? `Invalid ${first.path.join(".") || "body"}: ${first.message}`
        : "Invalid body.",
    });
  }
  return parsed.data;
}

function tooLarge(): SpeeqError {
  return new SpeeqError("INVALID_INPUT", { message: "Request body is too large." });
}

async function readLimited(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Extracts the bearer token from `Authorization`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
