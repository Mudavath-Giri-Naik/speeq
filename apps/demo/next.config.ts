import { resolve } from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";
const logger = {
  info: () => {},
  error: () => console.error("[demo] Could not load an environment file."),
};

// Next has already loaded the app's env. Preserve its overrides before loading the root files.
const { parsedEnv } = loadEnvConfig(process.cwd(), dev, logger);
updateInitialEnv(parsedEnv ?? {});
loadEnvConfig(resolve(process.cwd(), "../.."), dev, logger, true);

const config: NextConfig = { agentRules: false, serverExternalPackages: ["mongodb"] };
export default config;
