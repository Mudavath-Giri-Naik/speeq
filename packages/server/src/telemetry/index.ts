import { type AgentUser, DEFAULT_LANGUAGES, TelemetryFeaturesSchema } from "@speeq/core";
import type { SpeeqConfig } from "../config.js";
import { createCollector } from "./collector.js";
import { createHttpTransport } from "./http-transport.js";
import { noopTelemetry, type TelemetrySink } from "./sink.js";

function kind(value: string) {
  return TelemetryFeaturesSchema.shape.store.safeParse(value).success ? value : "custom";
}
/** Enables collection only when a destination is configured and telemetry is enabled. */
export function createTelemetry<TUser extends AgentUser>(
  config: SpeeqConfig<TUser>,
): TelemetrySink {
  try {
    const env = typeof process === "undefined" ? undefined : process.env;
    const settings = config.telemetry;
    if (settings?.enabled === false || env?.SPEEQ_TELEMETRY === "0") return noopTelemetry;
    const endpoint = (settings?.endpoint ?? env?.SPEEQ_PLATFORM_URL)?.trim();
    const transport = settings?.transport ?? (endpoint ? createHttpTransport(endpoint) : undefined);
    if (!transport) return noopTelemetry;
    return createCollector({
      transport,
      projectKey: config.projectKey,
      flushIntervalMs: settings?.flushIntervalMs ?? 60000,
      features: {
        navigation: !!config.routes?.length,
        tools: !!config.tools?.length,
        knowledge: !!config.knowledge?.length,
        audit: config.audit?.authorize !== undefined,
        confirmations: config.tools?.some((tool) => tool.risk === "write") ?? false,
        store: kind(config.store.kind),
        llm: kind(config.llm.kind),
        languageCount: config.agent.languages?.length || DEFAULT_LANGUAGES.length,
      },
      warn: (message) => (config.logger ?? console).warn(message),
    });
  } catch {
    return noopTelemetry;
  }
}
