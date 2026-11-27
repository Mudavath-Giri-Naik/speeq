import { type AgentContext, isSpeeqError, SpeeqError } from "@speeq/core";

/** Options for {@link bindEndpoint}. Everything except the input comes from the developer. */
export interface EndpointBindingOptions {
  /** Origin of the host app, from config, never from the model. `https`, or `http` on loopback. */
  baseUrl: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Relative path such as `/api/items/:id`. Literal segments are `[A-Za-z0-9._~-]` only. */
  path: string;
  /** Input keys sent as query parameters. Other keys go to the JSON body (not allowed for GET). */
  query?: readonly string[];
  /** Forward only `cookie` and `authorization` from the current request. Default `false`. */
  forwardAuth?: boolean;
  /** Default 8000, at most 30000. */
  timeoutMs?: number;
  /** Default 262144, at most 2097152. */
  maxResponseBytes?: number;
  /** Custom fetch (tests). */
  fetch?: typeof fetch;
}

const PARAM = /^:([A-Za-z_][A-Za-z0-9_]*)$/;
const LITERAL = /^[A-Za-z0-9._~-]+$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_TIMEOUT = 30_000;
const MAX_BYTES = 2 * 1024 * 1024;

function misconfigured(reason: string): never {
  throw new SpeeqError("NOT_CONFIGURED", { message: `speeq: bindEndpoint ${reason}` });
}
function invalid(reason: string): never {
  throw new SpeeqError("INVALID_INPUT", { message: reason });
}
function toolError(reason: string): never {
  throw new SpeeqError("TOOL_ERROR", { message: reason });
}
function parseBase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return misconfigured("needs an absolute baseUrl");
  }
  const loopback = LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    misconfigured("baseUrl must be https (http only for localhost)");
  if (url.username || url.password) misconfigured("baseUrl must not contain credentials");
  if (url.pathname !== "/" || url.search || url.hash)
    misconfigured("baseUrl must be an origin only");
  return url;
}
/** Split a path template into validated literal and parameter segments. */
function parsePath(path: string): { literal?: string; param?: string }[] {
  if (typeof path !== "string" || !path.startsWith("/")) misconfigured("path must start with /");
  if (path === "/") return [];
  const segments = path.slice(1).split("/");
  return segments.map((s) => {
    const param = PARAM.exec(s);
    if (param?.[1]) return { param: param[1] };
    if (!LITERAL.test(s) || s === "." || s === "..")
      return misconfigured("path has an unsupported segment");
    return { literal: s };
  });
}
function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}
function pathValue(name: string, value: unknown): string {
  const s = scalar(value);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (!s || s.length > 200 || s === "." || s === ".." || /[/\\\u0000-\u001f\u007f]/.test(s))
    invalid(`Invalid value for ${name}`);
  return encodeURIComponent(s);
}
async function readCapped(response: Response, limit: number): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) toolError("Endpoint response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      toolError("Endpoint response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Binds one host HTTP endpoint as a tool handler. The method and relative path are fixed by the
 * developer; the model supplies only parameter values. Requests stay on the configured origin,
 * never follow redirects, time out, cap the response size and forward credentials only when
 * `forwardAuth` is set. Errors never include response bodies or headers.
 */
export function bindEndpoint(options: EndpointBindingOptions) {
  const base = parseBase(options.baseUrl);
  const segments = parsePath(options.path);
  const params = new Set(segments.flatMap((s) => (s.param ? [s.param] : [])));
  const queryKeys = new Set(options.query ?? []);
  for (const q of queryKeys) if (params.has(q)) misconfigured("query repeats a path parameter");
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8000, 1), MAX_TIMEOUT);
  const limit = Math.min(Math.max(options.maxResponseBytes ?? 262_144, 1), MAX_BYTES);
  const doFetch = options.fetch ?? globalThis.fetch;
  const hasBody = options.method !== "GET";

  return async (input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Invalid input");
    const pathname = `/${segments
      .map((s) => (s.param ? pathValue(s.param, input[s.param]) : s.literal))
      .join("/")}`;
    const url = new URL(pathname, base);
    if (url.origin !== base.origin) invalid("Invalid path");
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (params.has(key) || value === undefined || value === null) continue;
      if (queryKeys.has(key)) {
        for (const item of Array.isArray(value) ? value.slice(0, 50) : [value]) {
          const s = scalar(item);
          if (s === undefined) invalid(`Invalid value for ${key}`);
          url.searchParams.append(key, s);
        }
      } else if (hasBody) body[key] = value;
      else invalid(`Unexpected parameter ${key}`);
    }
    const headers = new Headers({ accept: "application/json" });
    if (options.forwardAuth) {
      for (const name of ["cookie", "authorization"]) {
        const v = ctx.request.headers.get(name);
        if (v) headers.set(name, v);
      }
    }
    let payload: string | undefined;
    if (hasBody && Object.keys(body).length > 0) {
      payload = JSON.stringify(body);
      headers.set("content-type", "application/json");
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await doFetch(url, {
        method: options.method,
        headers,
        body: payload,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.any([ctx.signal, timeout]),
      });
    } catch {
      if (timeout.aborted) throw new SpeeqError("TOOL_TIMEOUT");
      return toolError("Endpoint request failed");
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      toolError("Endpoint redirected");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      toolError(`Endpoint returned status ${response.status}`);
    }
    if (response.status === 204) return null;
    let text: string;
    try {
      text = await readCapped(response, limit);
    } catch (error) {
      if (isSpeeqError(error)) throw error;
      if (timeout.aborted) throw new SpeeqError("TOOL_TIMEOUT");
      return toolError("Endpoint response could not be read");
    }
    if (!(response.headers.get("content-type") ?? "").includes("json")) return text;
    try {
      return JSON.parse(text);
    } catch {
      return toolError("Endpoint returned invalid JSON");
    }
  };
}
