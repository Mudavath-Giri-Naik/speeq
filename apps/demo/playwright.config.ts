import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3107";

export default defineConfig({
  testDir: "./e2e",
  // The demo shares one in-memory conversation store, and the audit test reads the newest session.
  // Specs must not run at the same time.
  workers: 1,
  // The dev server compiles each route on first visit.
  timeout: 150_000,
  expect: { timeout: 40_000 },
  use: { baseURL, browserName: "chromium" },
  webServer: {
    command: "pnpm exec next dev -p 3107",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SPEEQ_SECRET: "e2e-secret-e2e-secret-e2e-secret",
      DEMO_ADMIN_PASSWORD: "e2e-admin",
      SPEEQ_LLM: "mock",
      GROQ_API_KEY: "",
      GEMINI_API_KEY: "",
      MONGODB_URI: "",
      SPEEQ_TELEMETRY: "0",
    },
  },
});
