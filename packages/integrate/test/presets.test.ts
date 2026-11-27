import { describe, expect, it } from "vitest";
import { guessPreset, PRESETS, presetById } from "../src/index.js";

describe("presets", () => {
  it("has unique ids and only known placeholders", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS)
      for (const t of [...p.greeting.guest, ...p.greeting.member, ...p.greeting.returning])
        for (const m of t.matchAll(/\{([^}]+)\}/g))
          expect(["agent", "business", "name", "cart.count"], `${p.id}: ${t}`).toContain(m[1]);
  });
  it("always has a member greeting without a name, so nothing is invented", () => {
    for (const p of PRESETS.filter((x) => x.greeting.member.length))
      expect(
        p.greeting.member.some((t) => !t.includes("{")),
        p.id,
      ).toBe(true);
  });
  it("personal starters are for members and need a matching source", () => {
    for (const p of PRESETS)
      for (const s of p.starters)
        if (/\bmy\b/i.test(s.label)) {
          expect(s.auth, s.label).toBe("member");
          expect(s.requires?.length, s.label).toBeGreaterThan(0);
        }
  });
  it("guesses from routes and capabilities with evidence, or falls back to general", () => {
    const g = guessPreset(
      ["/courses", "/practice/[subject]", "/pricing"],
      ["enroll_course", "getQuestions"],
    );
    expect(g.id).toBe("education");
    expect(g.because).toContain("route /courses");
    expect(guessPreset(["/about"], []).id).toBe("general");
    expect(guessPreset(["/cart", "/products/[id]"], ["addToCart"]).id).toBe("ecommerce");
    expect(presetById("saas")?.label).toContain("SaaS");
  });
});
