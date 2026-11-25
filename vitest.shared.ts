import { fileURLToPath } from "node:url";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig, type ViteUserConfig } from "vitest/config";

/**
 * Shared Vitest config for workspace packages. Resolves sibling packages to their TypeScript
 * source through the `@speeq/source` export condition, so tests never need a build.
 */
export function speeqVitestConfig(overrides: ViteUserConfig["test"] = {}): ViteUserConfig {
  return defineConfig({
    resolve: { conditions: ["@speeq/source", ...defaultClientConditions] },
    ssr: { resolve: { conditions: ["@speeq/source", ...defaultServerConditions] } },
    test: {
      environment: "node",
      include: ["test/**/*.test.{ts,tsx}"],
      setupFiles: [fileURLToPath(new URL("./vitest.setup-env.ts", import.meta.url))],
      ...overrides,
    },
  });
}
