import type { CreateSessionResponse } from "@speeq/core";
import { SpeeqError } from "@speeq/core/errors";
import { pageContext } from "./context.js";
import { post, RequestError } from "./stream.js";
import type { SpeeqClientOptions } from "./types.js";

type Session = Omit<CreateSessionResponse, "protocolVersion">;

function valid(s: Session | null): s is Session {
  const c = s?.config;
  return (
    !!s &&
    typeof s.sessionId === "string" &&
    !!s.sessionId &&
    typeof s.sessionToken === "string" &&
    !!s.sessionToken &&
    typeof s.expiresAt === "string" &&
    Number.isFinite(Date.parse(s.expiresAt)) &&
    !!c &&
    typeof c.agentName === "string" &&
    Array.isArray(c.languages) &&
    c.languages.length > 0 &&
    c.languages.every((l) => typeof l === "string") &&
    c.languages.includes(c.defaultLanguage) &&
    !!c.features &&
    (["navigation", "knowledge", "tools", "audit"] as const).every(
      (k) => typeof c.features[k] === "boolean",
    ) &&
    Array.isArray(c.routes) &&
    c.routes.every((r) => typeof r?.id === "string" && typeof r.title === "string")
  );
}

/** Maintains the current token and retries a rejected token once per request. */
export function sessions(options: SpeeqClientOptions, onSession: (s: Session) => void) {
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const key = `speeq:session:${endpoint}`;
  const fetcher: typeof fetch = (url, init) => (options.fetch ?? globalThis.fetch)(url, init);
  let current: Session | null = null;
  function storage<T>(fn: (s: Storage) => T) {
    try {
      if (options.persistSession === "sessionStorage" && typeof sessionStorage !== "undefined")
        return fn(sessionStorage);
    } catch {
      /* Storage is optional (privacy settings, quota or corrupt JSON). */
    }
    return undefined;
  }
  async function ensure(language: string, signal: AbortSignal, refresh: boolean) {
    let session =
      current ?? (refresh ? null : storage((s) => JSON.parse(s.getItem(key) ?? "null")));
    if (!valid(session) || Date.parse(session.expiresAt) <= Date.now() + 30_000) {
      const response = await post(
        fetcher,
        `${endpoint}/session`,
        { language, context: pageContext(options.getContext) },
        signal,
      );
      const data: Session = await response.json();
      signal.throwIfAborted();
      if (!valid(data)) throw new SpeeqError("INTERNAL", { retryable: true });
      const { sessionId, sessionToken, expiresAt, config } = data;
      session = { sessionId, sessionToken, expiresAt, config };
      storage((s) => s.setItem(key, JSON.stringify(session)));
    }
    if (session !== current) {
      current = session;
      onSession(session);
    }
    return session as Session;
  }

  return async (
    path: "turn" | "confirm",
    language: string,
    makeBody: () => unknown,
    signal: AbortSignal,
  ) => {
    let session = await ensure(language, signal, false);
    signal.throwIfAborted();
    const body = makeBody();
    const send = () =>
      post(
        fetcher,
        `${endpoint}/session/${encodeURIComponent(session.sessionId)}/${path}`,
        body,
        signal,
        session.sessionToken,
      );
    try {
      return await send();
    } catch (error) {
      signal.throwIfAborted();
      if (
        !(error instanceof RequestError) ||
        error.httpStatus !== 401 ||
        !["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(error.code)
      )
        throw error;
      current = null;
      storage((s) => s.removeItem(key));
      session = await ensure(language, signal, true);
      return send();
    }
  };
}
