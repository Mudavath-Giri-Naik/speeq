import { resolve } from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";
const logger = {
  info: () => {},
  error: () => console.error("[platform] Could not load an environment file."),
};

// Next has already loaded the app's env. Preserve its overrides before loading the root files.
const { parsedEnv } = loadEnvConfig(process.cwd(), dev, logger);
updateInitialEnv(parsedEnv ?? {});
loadEnvConfig(resolve(process.cwd(), "../.."), dev, logger, true);

const config: NextConfig = {
  agentRules: false,
  async headers() {
    const noStore = [{ key: "cache-control", value: "no-store" }];
    return [
      {
        source: "/:path((?!api/v1/ingest/?$).*)",
        headers: [
          { key: "x-frame-options", value: "DENY" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "no-referrer" },
          { key: "x-robots-tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/login", headers: noStore },
    ];
  },
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};
export default config;
