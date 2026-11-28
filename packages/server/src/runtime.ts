import { type AgentUser, type LLMToolDefinition, SpeeqError } from "@speeq/core";
import { buildToolDefinitions, preferenceToolDefinition } from "./agent/tools.js";
import { buildUiToolDefinitions } from "./agent/ui.js";
import type { SpeeqConfig } from "./config.js";
import { bearerToken } from "./handler/http.js";
import { type ResolvedConfig, resolveConfig } from "./resolve.js";
import { clientKey, RateLimiter } from "./security/rate-limit.js";
import { type SessionClaims, verifySessionToken } from "./security/token.js";
import { noopTelemetry, type TelemetrySink } from "./telemetry/sink.js";

/** Long-lived (per instance) pieces shared by all requests. Holds no conversation state. */
export class Runtime<TUser extends AgentUser = AgentUser> {
  readonly config: ResolvedConfig<TUser>;
  readonly toolDefs: LLMToolDefinition[];
  /** UI action definitions, appended to `toolDefs` only for sessions that opted in. */
  readonly uiToolDefs: LLMToolDefinition[];
  /** `remember_preference`, appended only for signed-in users in `preferences` mode. */
  readonly preferenceToolDef: LLMToolDefinition | null;
  readonly telemetry: TelemetrySink;
  private readonly turnLimiter: RateLimiter | null;
  private readonly sessionLimiter: RateLimiter | null;
  private readonly identityLimiter: RateLimiter | null;
  private lastRetentionRun = 0;

  constructor(config: SpeeqConfig<TUser>, telemetry: TelemetrySink = noopTelemetry) {
    this.config = resolveConfig(config);
    this.toolDefs = buildToolDefinitions(this.config as ResolvedConfig);
    this.uiToolDefs = buildUiToolDefinitions(this.config as ResolvedConfig);
    this.preferenceToolDef = preferenceToolDefinition(this.config as ResolvedConfig);
    this.telemetry = telemetry;
    this.turnLimiter = this.config.turnsPerMinute
      ? new RateLimiter(this.config.turnsPerMinute)
      : null;
    this.sessionLimiter = this.config.sessionsPerMinute
      ? new RateLimiter(this.config.sessionsPerMinute)
      : null;
    // Its own budget, so focus probes never use up session creation.
    this.identityLimiter = this.config.sessionsPerMinute
      ? new RateLimiter(Math.max(30, this.config.sessionsPerMinute * 3))
      : null;
  }

  /**
   * Calls `resolveUser`. `failed` is true when it threw or returned a malformed user (logged);
   * `user` is then `null`. Callers decide whether a failure may be treated as anonymous.
   */
  async lookupUser(request: Request): Promise<{ user: TUser | null; failed: boolean }> {
    if (!this.config.raw.resolveUser) return { user: null, failed: false };
    try {
      const user = (await this.config.raw.resolveUser(request)) ?? null;
      if (
        user !== null &&
        (typeof user.id !== "string" ||
          user.id === "" ||
          (user.tenantId !== undefined &&
            (typeof user.tenantId !== "string" || user.tenantId === "")))
      ) {
        this.config.logger.error(
          "resolveUser returned a user without a valid string `id`/`tenantId`",
        );
        return { user: null, failed: true };
      }
      return { user, failed: false };
    } catch (error) {
      this.config.logger.error("resolveUser threw", error);
      return { user: null, failed: true };
    }
  }

  /** Calls `resolveUser`, treating a failure as "not signed in". */
  async resolveUser(request: Request): Promise<TUser | null> {
    return (await this.lookupUser(request)).user;
  }

  /**
   * Authenticates a session request: valid token for this session id, and the same user that
   * created the session (so a stolen token is useless after logout or for another account).
   */
  async authenticate(
    request: Request,
    sessionId: string,
  ): Promise<{ claims: SessionClaims; user: TUser | null }> {
    const token = bearerToken(request);
    if (!token) throw new SpeeqError("UNAUTHENTICATED");
    const claims = await verifySessionToken(token, this.config.secret);
    if (claims.sid !== sessionId) throw new SpeeqError("FORBIDDEN");
    const { user, failed } = await this.lookupUser(request);
    // A signed-in session never degrades to anonymous because the host's auth is down.
    if (failed && claims.uid !== null) throw new SpeeqError("AUTH_UNAVAILABLE");
    // Logout, host-session expiry, account switch and tenant switch all end this session.
    if ((user?.id ?? null) !== claims.uid || (user?.tenantId ?? null) !== claims.tid) {
      throw new SpeeqError("IDENTITY_CHANGED");
    }
    // A conversation the user cleared is never continued, even from another open tab.
    if (claims.uid !== null && this.config.raw.store.clearScope) {
      const summary = await this.config.raw.store.getSessionSummary(sessionId);
      if (summary?.forgottenAt) throw new SpeeqError("SESSION_EXPIRED");
    }
    return { claims, user };
  }

  /** Throws `RATE_LIMITED` if this user/IP or session sent too many turns. Best effort. */
  limitTurn(request: Request, userId: string | null, sessionId: string): void {
    if (!this.turnLimiter) return;
    const who = userId ? `u:${userId}` : `ip:${clientKey(request)}`;
    const wait = this.turnLimiter.hit(who) ?? this.turnLimiter.hit(`s:${sessionId}`);
    if (wait !== null) throw new SpeeqError("RATE_LIMITED", { retryAfterMs: wait });
  }

  /** Throws `RATE_LIMITED` if this user/IP created too many sessions. Best effort. */
  limitSession(request: Request, userId: string | null): void {
    if (!this.sessionLimiter) return;
    const wait = this.sessionLimiter.hit(userId ? `u:${userId}` : `ip:${clientKey(request)}`);
    if (wait !== null) throw new SpeeqError("RATE_LIMITED", { retryAfterMs: wait });
  }

  /** Throws `RATE_LIMITED` if this user/IP probed the identity too often. Best effort. */
  limitIdentity(request: Request, userId: string | null): void {
    if (!this.identityLimiter) return;
    const wait = this.identityLimiter.hit(userId ? `u:${userId}` : `ip:${clientKey(request)}`);
    if (wait !== null) throw new SpeeqError("RATE_LIMITED", { retryAfterMs: wait });
  }

  /** Hands work to `waitUntil` if configured; otherwise lets it run and swallows errors. */
  background(promise: Promise<unknown>): void {
    const safe = promise.catch((error: unknown) =>
      this.config.logger.error("background task failed", error),
    );
    this.config.raw.waitUntil?.(safe);
  }

  /** Runs retention at most once a day per instance, in the background. */
  maybeRunRetention(): void {
    const days = this.config.memory.retentionDays;
    if (!days || Date.now() - this.lastRetentionRun < 86_400_000) return;
    this.lastRetentionRun = Date.now();
    this.background(this.purgeExpired());
  }

  /**
   * Deletes sessions older than the retention period (the smaller of `audit.retentionDays` and
   * `memory.retentionDays`). Call it from your own cron for reliability.
   */
  async purgeExpired(): Promise<{ sessions: number; events: number }> {
    const days = this.config.memory.retentionDays;
    if (!days) return { sessions: 0, events: 0 };
    return this.config.raw.store.deleteOlderThan(new Date(Date.now() - days * 86_400_000));
  }
}
