import { describe, expect, it } from "vitest";
import {
  DEFAULT_REASON_MESSAGES,
  ERROR_REASONS,
  SpeeqError,
  toPublicError,
} from "../src/errors.js";
import { mapProviderHttpError } from "../src/utils/index.js";

describe("error reasons (ADR-0026)", () => {
  it("maps provider responses to stable reasons", () => {
    expect(
      mapProviderHttpError("groq", 429, "Rate limit reached for tokens per minute").reason,
    ).toBe("rate_limited");
    expect(
      mapProviderHttpError("gemini", 429, "RESOURCE_EXHAUSTED: quota exceeded per day").reason,
    ).toBe("quota_exhausted");
    expect(mapProviderHttpError("groq", 401, "Invalid API Key").reason).toBe("invalid_key");
    expect(mapProviderHttpError("groq", 404, "The model `x` does not exist").reason).toBe(
      "model_unavailable",
    );
    expect(mapProviderHttpError("groq", 503, "overloaded").reason).toBe("busy");
    expect(mapProviderHttpError("groq", 504, "").reason).toBe("timeout");
  });

  it("never puts provider text in the public message", () => {
    const e = mapProviderHttpError("groq", 401, "Invalid API Key gsk_secret_abc123 for org-42");
    const pub = toPublicError(e);
    expect(pub.reason).toBe("invalid_key");
    expect(JSON.stringify(pub)).not.toMatch(/gsk_|org-42|API Key/);
    expect(pub.message).toBe(DEFAULT_REASON_MESSAGES.invalid_key);
  });

  it("has a customer-safe message for every reason", () => {
    for (const r of ERROR_REASONS) {
      expect(DEFAULT_REASON_MESSAGES[r].length).toBeGreaterThan(10);
      expect(DEFAULT_REASON_MESSAGES[r]).not.toMatch(/key|provider|groq|gemini|stack/i);
    }
    expect(new SpeeqError("RATE_LIMITED", { reason: "busy" }).message).toBe(
      DEFAULT_REASON_MESSAGES.busy,
    );
  });
});
