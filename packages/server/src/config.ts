import type {
  AgentUser,
  ConversationStore,
  KnowledgeSource,
  LLMProvider,
  NewConversationEvent,
  TelemetryTransport,
} from "@speeq/core";
import type { RouteDefinition, ToolDefinition } from "./define.js";

/** Minimal logger. Defaults to `console` with a `[speeq]` prefix. */
export interface SpeeqLogger {
  error(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
}

/** Agent behavior. */
export interface AgentConfig {
  /** Shown to users and used in the system prompt, e.g. `Helper`. */
  name: string;
  /** Your own system instructions (tone, scope, rules). */
  instructions: string;
  /** BCP 47 tags the agent may answer in. Default `["en-IN", "te-IN", "hi-IN"]`. */
  languages?: string[];
  /** Default `languages[0]`. */
  defaultLanguage?: string;
  /** Maximum LLM calls per turn (tool round-trips). Default 5. */
  maxSteps?: number;
  /** How many previous user turns are sent to the model. Default 8. */
  historyTurns?: number;
  temperature?: number;
}

/** Audit-log options. */
export interface AuditConfig {
  /**
   * Who may read the audit log through `GET /audit/*`. **Without this, audit routes return 404.**
   * Typically checks that the request comes from one of your admins.
   */
  authorize?(request: Request): boolean | Promise<boolean>;
  /**
   * Runs on every event before it is stored. Return a modified copy (e.g. with secrets removed),
   * or `null` to not store the event. Stored events are also the history the model sees later.
   * Secret-looking keys (`password`, `token`, …) in tool args are always redacted first.
   */
  redact?(event: NewConversationEvent): NewConversationEvent | null;
  /** Delete sessions older than this many days (best effort, see `purgeExpired`). */
  retentionDays?: number;
}

/** Limits that keep turns small, fast and safe. */
export interface GuardrailsConfig {
  /** Tool output longer than this is truncated before the model sees it. Default 8000. */
  maxToolOutputChars?: number;
  /** Default 8000 ms. */
  toolTimeoutMs?: number;
  /** Best-effort, per instance (see docs). Default 20 turns per minute per user/IP and per session. */
  rateLimit?: { turnsPerMinute?: number; sessionsPerMinute?: number } | false;
  /** Maximum JSON body size. Default 32 KiB. */
  maxRequestBytes?: number;
  /** Session token lifetime. Default 12 hours. */
  sessionTtlSeconds?: number;
}

/** Anonymous usage telemetry (see docs/reference/telemetry.md). */
export interface TelemetryConfig {
  /** Default `true`. `SPEEQ_TELEMETRY=0` also disables it. */
  enabled?: boolean;
  /** Platform base URL. Defaults to `SPEEQ_PLATFORM_URL`. Nothing is sent without one. */
  endpoint?: string;
  /** Custom transport (tests, proxies). */
  transport?: TelemetryTransport;
  /** Minimum time between sends. Default 60 s. */
  flushIntervalMs?: number;
}

/** Everything `createSpeeq` accepts. */
export interface SpeeqConfig<TUser extends AgentUser = AgentUser> {
  /** Public project key (`pk_…`) from the speeq platform. Used only for telemetry. */
  projectKey?: string;
  /** Signs session tokens. Required when `NODE_ENV=production`. Use 32+ random characters. */
  secret?: string;
  agent: AgentConfig;
  llm: LLMProvider;
  store: ConversationStore;
  /** Returns the signed-in user for a request (e.g. from your NextAuth session), or `null`. */
  resolveUser?(request: Request): TUser | null | Promise<TUser | null>;
  /** Allow sessions without a user. Default: `true` if `resolveUser` is not set, else `false`. */
  allowAnonymous?: boolean;
  routes?: RouteDefinition[];
  // biome-ignore lint/suspicious/noExplicitAny: tool inputs differ per tool; each is validated by its own schema.
  tools?: ToolDefinition<any, TUser>[];
  knowledge?: KnowledgeSource<TUser>[];
  audit?: AuditConfig;
  guardrails?: GuardrailsConfig;
  telemetry?: TelemetryConfig;
  /** Extra origins allowed to call the API (CORS). Same-origin only by default. */
  allowedOrigins?: string[];
  /** Hand background work to the platform (e.g. Vercel `waitUntil`) so it survives the response. */
  waitUntil?(promise: Promise<unknown>): void;
  logger?: SpeeqLogger;
}
