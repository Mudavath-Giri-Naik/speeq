import type { TelemetryEventOf } from "@speeq/core";
import { SDK_VERSION } from "../version.js";

/** Describes the SDK and execution environment using only schema fields. */
export function runtimeInfo(): Pick<
  TelemetryEventOf<"sdk.init">,
  "sdkVersions" | "runtime" | "framework"
> {
  const globals = globalThis as typeof globalThis & {
    Bun?: { version: string };
    Deno?: { version: { deno: string } };
    EdgeRuntime?: string;
  };
  const host = typeof process === "undefined" ? undefined : process;
  let name: TelemetryEventOf<"sdk.init">["runtime"]["name"] = "unknown";
  let version = "";
  if (globals.EdgeRuntime !== undefined) name = "edge";
  else if (globals.Bun) {
    name = "bun";
    version = globals.Bun.version;
  } else if (globals.Deno) {
    name = "deno";
    version = globals.Deno.version.deno;
  } else if (host?.versions?.node) {
    name = "node";
    version = host.versions.node;
  }
  return {
    sdkVersions: { "@speeq/server": SDK_VERSION },
    runtime: { name, version: version.replace(/[^0-9a-z.+-]/g, "").slice(0, 30) },
    framework: host?.env?.NEXT_RUNTIME !== undefined ? "nextjs" : "unknown",
  };
}
