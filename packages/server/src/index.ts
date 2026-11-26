/**
 * `@speeq/server`: the speeq runtime that runs in **your** backend. Tools run here with your
 * database and your user's permissions; conversations are stored in your store.
 * @packageDocumentation
 */
import type { AgentUser } from "@speeq/core";
import { resolveUpdateCheck, type SpeeqConfig } from "./config.js";
import { createRequestHandler, type SpeeqHandler } from "./handler/index.js";
import { Runtime } from "./runtime.js";
import { createTelemetry } from "./telemetry/index.js";
import { checkForUpdate } from "./update-check.js";
import { SDK_VERSION } from "./version.js";

let updateChecked = false;

/** A configured speeq instance. */
export interface Speeq {
  /** Web-standard handler: mount it at a catch-all route such as `/api/speeq/[[...speeq]]`. */
  handler: SpeeqHandler;
  /**
   * Deletes sessions older than `audit.retentionDays`. It also runs at most daily per instance
   * when sessions start. Call it from a cron job if you need retention to be reliable.
   */
  purgeExpired(): Promise<{ sessions: number; events: number }>;
}

/**
 * Creates a speeq instance from your configuration.
 *
 * @example
 * export const speeq = createSpeeq({
 *   secret: process.env.SPEEQ_SECRET,
 *   agent: { name: "Helper", instructions: "You help students use this site." },
 *   llm: createOpenAICompatibleProvider({ baseURL, apiKey, model }),
 *   store: createMongoStore({ db }),
 *   resolveUser: async (req) => getUserFromSession(req),
 *   routes: [defineRoute({ id: "practice", path: "/practice", title: "Practice" })],
 *   tools: [countQuestions],
 * });
 */
export function createSpeeq<TUser extends AgentUser = AgentUser>(
  config: SpeeqConfig<TUser>,
): Speeq {
  const updateCheck = resolveUpdateCheck(config.updateCheck);
  const telemetry = createTelemetry(config);
  const runtime = new Runtime(config, telemetry);
  if (
    !updateChecked &&
    typeof process !== "undefined" &&
    process.versions?.node &&
    typeof window === "undefined" &&
    !("EdgeRuntime" in globalThis)
  ) {
    updateChecked = true;
    void checkForUpdate({
      currentVersion: SDK_VERSION,
      env: process.env,
      enabled: updateCheck,
    }).catch(() => {});
  }
  return {
    handler: createRequestHandler(runtime),
    purgeExpired: () => runtime.purgeExpired(),
  };
}

export type { AgentContext, AgentUser } from "@speeq/core";
export { SpeeqError } from "@speeq/core";
export type {
  AgentConfig,
  AuditConfig,
  GuardrailsConfig,
  SpeechConfig,
  SpeeqConfig,
  SpeeqLogger,
  TelemetryConfig,
} from "./config.js";
export {
  defineKnowledgeSource,
  defineRoute,
  defineTool,
  type RouteDefinition,
  type ToolDefinition,
  type ToolRisk,
} from "./define.js";
export type { SpeeqHandler } from "./handler/index.js";
export {
  type SessionClaims,
  signSessionToken,
  timingSafeEqual,
  verifySessionToken,
} from "./security/token.js";
export { createSpeechConfig } from "./speech/profiles.js";
export { SDK_VERSION } from "./version.js";
