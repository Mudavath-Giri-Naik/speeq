import type { CreateSessionResponse } from "@speeq/core";
import { SpeeqError } from "@speeq/core/errors";
import { pageContext } from "./context.js";
import { validIdentity } from "./identity.js";
import { post, RequestError } from "./stream.js";
import type { SpeeqClientOptions } from "./types.js";

/** A session as the client keeps it. */
export type Session = Omit<CreateSessionResponse, "protocolVersion">;

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
    c.routes.every((r) => typeof r?.id === "string" && typeof r.title === "string") &&
    (s.identity === undefined || validIdentity(s.identity))
  );
}

/** Maintains the current token and retries a rejected token once per request. */
export function sessions(
  options: SpeeqClientOptions,
  onSession: (s: Session) => void,
  capabilities: () => string[] = () => [],
  /** Called when a speech request learns that the signed-in identity changed. */
  onIdentityChanged: () => void = () => {},
) {
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
  let opening: { signal: AbortSignal; result: Promise<Session> } | undefined;
  async function create(language: string, signal: AbortSignal): Promise<Session> {
    const response = await post(
      fetcher,
      `${endpoint}/session`,
      {
        language,
        context: pageContext(options.getContext),
        ...(capabilities().length ? { capabilities: capabilities() } : {}),
      },
      signal,
    );
    const data: Session = await response.json();
    signal.throwIfAborted();
    if (!valid(data)) throw new SpeeqError("INTERNAL", { retryable: true });
    const { sessionId, sessionToken, expiresAt, config, identity } = data;
    return { sessionId, sessionToken, expiresAt, config, ...(identity ? { identity } : {}) };
  }
  async function ensure(language: string, signal: AbortSignal, refresh: boolean): Promise<Session> {
    signal.throwIfAborted();
    let session =
      current ?? (refresh ? null : storage((s) => JSON.parse(s.getItem(key) ?? "null")));
    if (!valid(session) || Date.parse(session.expiresAt) <= Date.now() + 30000) {
      if (!opening || opening.signal.aborted)
        opening = { signal, result: create(language, signal) };
      const pending = opening;
      try {
        session = await pending.result;
      } catch (error) {
        if (!signal.aborted && pending.signal.aborted) return ensure(language, signal, refresh);
        throw error;
      } finally {
        if (opening === pending) opening = undefined;
      }
      signal.throwIfAborted();
      storage((s) => s.setItem(key, JSON.stringify(session)));
    }
    if (session !== current) {
      current = session;
      onSession(session);
    }
    return session as Session;
  }

  /** Drops the current session (memory and storage); the next request opens a new one. */
  function forget() {
    current = null;
    opening = undefined;
    storage((s) => s.removeItem(key));
  }

  const requestWith = async (
    path: "turn" | "confirm" | "ui-result" | ((base: string, token: string) => Promise<Response>),
    language: string,
    makeBody: () => unknown,
    signal: AbortSignal,
  ) => {
    let session = await ensure(language, signal, false);
    signal.throwIfAborted();
    const body = makeBody();
    const send = () =>
      typeof path === "function"
        ? path(`${endpoint}/session/${encodeURIComponent(session.sessionId)}`, session.sessionToken)
        : post(
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
      if (error instanceof RequestError && error.code === "IDENTITY_CHANGED") {
        // This session belonged to someone else (or to nobody): never reuse it.
        if (current === session) forget();
        if (typeof path === "function") onIdentityChanged();
        throw error;
      }
      if (
        !(error instanceof RequestError) ||
        error.httpStatus !== 401 ||
        !["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(error.code)
      )
        throw error;
      if (current === session) {
        current = null;
        storage((s) => s.removeItem(key));
      }
      session = await ensure(language, signal, true);
      return send();
    }
  };
  return Object.assign(requestWith, {
    forget,
    /** The current session, if one is open. */
    current: () => current,
  });
}
