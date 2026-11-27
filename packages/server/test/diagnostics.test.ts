import { mapProviderHttpError } from "@speeq/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logProviderDiagnostic, scrubBody } from "../src/diagnostics.js";

afterEach(() => vi.unstubAllEnvs());

describe("provider diagnostics", () => {
  it("prints one actionable line in development, without secrets", () => {
    const warn = vi.fn();
    const error = mapProviderHttpError(
      "groq",
      429,
      "Rate limit reached. Authorization: Bearer gsk_abcdefghijklmnopqrstuvwxyz123456 user ravi@example.com",
      "7",
    );
    logProviderDiagnostic({ warn, error: vi.fn() }, error);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain(
      "Model provider groq: status 429, reason rate_limited, retry in 7000 ms.",
    );
    expect(line).toContain("Suggested action");
    expect(line).not.toContain("gsk_");
    expect(line).not.toContain("ravi@example.com");
  });

  it("is silent in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.fn();
    logProviderDiagnostic({ warn, error: vi.fn() }, mapProviderHttpError("groq", 500, "x"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("scrubs keys and tokens from bodies", () => {
    expect(scrubBody("api_key=sk-proj-abcdefghijklmnopqrstu and more")).not.toContain("sk-proj");
  });
});
