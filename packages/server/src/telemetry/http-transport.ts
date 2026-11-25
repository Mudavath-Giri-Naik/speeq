import type { TelemetryTransport } from "@speeq/core";

/** Creates the anonymous JSON transport for a platform endpoint. */
export function createHttpTransport(endpoint: string): TelemetryTransport {
  const url = `${endpoint.replace(/\/+$/, "")}/api/v1/ingest`;
  return {
    async send(batch, { signal }) {
      const response = await globalThis.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
        signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        keepalive: true,
      });
      if (!response.ok) throw new Error("telemetry request failed");
    },
  };
}
