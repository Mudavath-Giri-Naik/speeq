import type { AgentUser } from "@speeq/core";
import type { SpeeqConfig } from "../config.js";
import { noopTelemetry, type TelemetrySink } from "./sink.js";

/** Creates the telemetry sink for a configuration (implemented in a later stage). */
export function createTelemetry<TUser extends AgentUser>(
  _config: SpeeqConfig<TUser>,
): TelemetrySink {
  return noopTelemetry;
}
