import { describe, expect, it } from "vitest";
import {
  memoryFs,
  personalRuntimeChecks,
  personalStaticChecks,
  type Setup,
  seal,
} from "../src/index.js";

const base: Setup = {
  setupVersion: 2,
  provider: "mock",
  voice: "none",
  languages: ["en-IN"],
  ui: false,
  env: true,
};
const byId = (cs: { id: string; status: string; detail?: string }[]) =>
  Object.fromEntries(cs.map((c) => [c.id, c]));
const wiredConfig =
  'import { agentProfile, agentSettings } from "./.speeq/generated/agent";\nexport const speeq = createSpeeq({\n  ...agentSettings,\n  agent: agentProfile,\n});\n';

describe("personalisation static checks", () => {
  it("skips everything for a 0.11 project", async () => {
    const fs = memoryFs({});
    const c = byId(
      await personalStaticChecks({ fs, prefix: "", setup: undefined, envHas: () => false }),
    );
    expect(c.P1?.status).toBe("skip");
    expect(c.P2?.status).toBe("skip");
    expect(c.P3?.status).toBe("skip");
    expect(c.P4?.status).toBe("pass");
  });

  it("fails when settings exist but the config does not use them", async () => {
    const fs = memoryFs({
      ".speeq/generated/agent.ts": seal("export const agentSettings = {};\n"),
      "speeq.config.ts": "export const speeq = createSpeeq({ llm });\n",
    });
    const c = byId(
      await personalStaticChecks({ fs, prefix: "", setup: base, envHas: () => false }),
    );
    expect(c.P1?.status).toBe("fail");
  });

  it("checks sign-in, memory and storage honestly", async () => {
    const files = {
      ".speeq/generated/agent.ts": seal("export const agentSettings = {};\n"),
      ".speeq/generated/identity.ts": seal(
        "export async function resolveUser() { return null; }\n",
      ),
      "speeq.config.ts": wiredConfig,
      "auth.ts": "export const { auth } = NextAuth({});\n",
    };
    const setup: Setup = {
      ...base,
      identity: {
        binding: { kind: "authjs", file: "auth.ts", exportName: "auth" },
        provider: "Auth.js",
      },
      memory: { mode: "persistent" },
      store: { kind: "mongodb", status: "configured" },
    };
    const noUri = byId(
      await personalStaticChecks({ fs: memoryFs(files), prefix: "", setup, envHas: () => false }),
    );
    expect(noUri.P1?.status).toBe("pass");
    expect(noUri.P2?.status).toBe("pass");
    expect(noUri.P3?.status).toBe("pass");
    expect(noUri.P4).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("SPEEQ_MONGODB_URI"),
    });
    const unverified = byId(
      await personalStaticChecks({
        fs: memoryFs(files),
        prefix: "",
        setup,
        envHas: (n) => n === "SPEEQ_MONGODB_URI",
      }),
    );
    expect(unverified.P4).toMatchObject({
      status: "warn",
      detail: expect.stringContaining("not been verified"),
    });
    const moved = byId(
      await personalStaticChecks({
        fs: memoryFs({ ...files, "auth.ts": "export const x = 1;\n" }),
        prefix: "",
        setup,
        envHas: () => true,
      }),
    );
    expect(moved.P2?.status).toBe("fail");
    const noAuth = byId(
      await personalStaticChecks({
        fs: memoryFs(files),
        prefix: "",
        setup: { ...setup, identity: {} },
        envHas: () => true,
      }),
    );
    expect(noAuth.P3?.status).toBe("warn");
  });
});

describe("personalisation runtime checks", () => {
  it("pass with the app's settings: identity lifecycle, real greetings, memory isolation", async () => {
    const setup: Setup = {
      ...base,
      greeting: {
        guest: ["Welcome to {business}!", "Welcome!"],
        member: ["Welcome back, {name}!", "Welcome back!"],
      },
      business: { name: "SwaSeekh" },
      identity: { expose: ["displayName"] },
      memory: { mode: "persistent" },
    };
    const c = byId(await personalRuntimeChecks(setup));
    expect(c.RP1).toMatchObject({ status: "pass" });
    expect(c.RP2).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("Welcome back, Asha"),
    });
    expect(c.RP3).toMatchObject({ status: "pass" });
  });

  it("never puts a name in a greeting when the name is not exposed", async () => {
    const c = byId(
      await personalRuntimeChecks({ ...base, greeting: { member: ["Hi {name}!", "Hi there!"] } }),
    );
    expect(c.RP2).toMatchObject({
      status: "pass",
      detail: expect.stringContaining('member: "Hi there!"'),
    });
  });
});
