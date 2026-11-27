import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPlan,
  ignoresEnvLocal,
  newSecret,
  planEnv,
  renderAssistant,
  renderDiff,
  rollback,
  spliceLayout,
} from "../src/index.js";
import { project, snapshot } from "./helpers.js";

type P = Awaited<ReturnType<typeof project>>;
const open: P[] = [];
async function make(name: string) {
  const p = await project(name);
  open.push(p);
  return p;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((p) => p.cleanup()));
});

const LAYOUT = `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`;

describe("env files", () => {
  const names = [
    { name: "GROQ_API_KEY", note: "Groq key" },
    { name: "SPEEQ_LLM_MODEL", note: "Model id" },
  ];
  it("creates a file with empty values and notes, and hides a generated secret in previews", () => {
    const secret = newSecret();
    expect(secret).toHaveLength(48);
    const plan = planEnv(undefined, [{ name: "SPEEQ_SECRET", note: "s" }, ...names], { secret });
    expect(plan?.append).toContain("GROQ_API_KEY=\n");
    expect(plan?.append).toContain(`SPEEQ_SECRET=${secret}`);
    expect(plan?.masked).toContain("SPEEQ_SECRET=<generated>");
    expect(plan?.masked).not.toContain(secret);
    expect(plan?.added).toEqual(["SPEEQ_SECRET", "GROQ_API_KEY", "SPEEQ_LLM_MODEL"]);
  });
  it("appends only missing names and never touches or reveals existing values", () => {
    const existing = "GROQ_API_KEY=gsk_real_value\nOTHER=1\n";
    const plan = planEnv(existing, names);
    expect(plan?.added).toEqual(["SPEEQ_LLM_MODEL"]);
    expect(plan?.append).not.toContain("gsk_real_value");
    expect(plan?.append).not.toContain("GROQ_API_KEY");
    expect(planEnv(existing + plan?.append, names)).toBeUndefined();
  });
  it("recognises export and spaced assignments, ignores comments, keeps CRLF", () => {
    expect(planEnv("export GROQ_API_KEY = x\r\nSPEEQ_LLM_MODEL=y\r\n", names)).toBeUndefined();
    const plan = planEnv("# GROQ_API_KEY=old\r\n", names);
    expect(plan?.added).toEqual(["GROQ_API_KEY", "SPEEQ_LLM_MODEL"]);
    expect(plan?.append.includes("\r\n")).toBe(true);
    expect(plan?.append.replace(/\r\n/g, "")).not.toContain("\n");
  });
  it("adds a separating blank line when the file has no trailing newline", () => {
    expect(planEnv("A=1", names)?.append.startsWith("\n\n# Added by speeq")).toBe(true);
  });
  it("detects .gitignore coverage", () => {
    expect(ignoresEnvLocal("node_modules\n.env*\n")).toBe(true);
    expect(ignoresEnvLocal(".env.local\r\n")).toBe(true);
    expect(ignoresEnvLocal(".env*.local")).toBe(true);
    expect(ignoresEnvLocal("node_modules\n")).toBe(false);
    expect(ignoresEnvLocal("# .env.local\n")).toBe(false);
  });
});

describe("layout splice", () => {
  it("adds the import and the component before </body>", () => {
    const r = spliceLayout(LAYOUT, "../components/speeq/assistant");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('import { SpeeqAssistant } from "../components/speeq/assistant";');
    expect(r.text).toMatch(/\{children\}\n\s+<SpeeqAssistant \/>\n\s+<\/body>/);
    const again = spliceLayout(r.text, "../components/speeq/assistant");
    expect(again).toMatchObject({ ok: false, reason: expect.stringContaining("already") });
  });
  it("keeps CRLF files consistent", () => {
    const r = spliceLayout(LAYOUT.replace(/\n/g, "\r\n"), "./a");
    expect(r.ok && !/[^\r]\n/.test(r.text)).toBe(true);
  });
  it("works when </body> shares a line and after a leading directive", () => {
    const r = spliceLayout(
      '"use client";\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\n',
      "./a",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.startsWith('"use client";\nimport { SpeeqAssistant }')).toBe(true);
  });
  it("refuses shapes it does not understand instead of guessing", () => {
    for (const source of [
      "export default function L() { return <div />; }",
      "export default function L({ children }) { return <html><body>hi</body></html>; }",
      "export default function L({ children }) { return <><body>{children}</body><body /></>; }",
      "export default function L( {",
    ]) {
      expect(spliceLayout(source, "./a").ok).toBe(false);
    }
  });
});

describe("generated chat box", () => {
  const syntax = (text: string) =>
    ts.transpileModule(text, {
      reportDiagnostics: true,
      fileName: "assistant.tsx",
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
    }).diagnostics?.length;
  it("parses in every voice mode and escapes names and languages", () => {
    for (const voice of ["none", "browser", "cloud"] as const) {
      const text = renderAssistant({
        voice,
        languages: ["en-IN", 'te-IN"; alert(1); //'],
        mock: true,
        name: 'Vidya "<b>" $& `x`',
      });
      expect(syntax(text)).toBe(0);
      expect(text).toContain(
        'const VOICE: "none" | "browser" | "cloud" | "sarvam" = ' + JSON.stringify(voice),
      );
      expect(text).not.toContain("alert(1); //\n");
      expect(text).not.toMatch(/__[A-Z_]+__/);
    }
  });
  it("uses the provider and cannot leak keys: it has no process.env or key names", () => {
    const text = renderAssistant({ voice: "cloud", languages: ["en-IN"], mock: false });
    expect(text).not.toMatch(/process\.env|API_KEY|apiKey/);
    expect(text).toContain("<SpeeqProvider");
    expect(text).toContain("showModal");
  });
});

describe("onboarding plan", () => {
  const setup = {
    ui: true,
    env: true,
    remember: true,
    providerId: "groq",
    voice: "browser" as const,
    languages: ["en-IN", "te-IN"],
  };
  async function ready() {
    const p = await make("next-app-minimal");
    await p.write("app/layout.tsx", LAYOUT);
    await p.write(".gitignore", "node_modules\n");
    return p;
  }
  it("writes the widget, splices the layout, appends env names and remembers the choices", async () => {
    const p = await ready();
    const plan = await p.plan(undefined, setup);
    const byPath = new Map(plan.changes.map((c) => [c.path, c]));
    expect(byPath.get("components/speeq/assistant.tsx")?.action).toBe("create");
    expect(byPath.get("app/layout.tsx")?.action).toBe("update");
    expect(byPath.get(".env.local")?.action).toBe("create");
    expect(byPath.get(".env.example")?.action).toBe("create");
    expect(byPath.get(".gitignore")?.action).toBe("append");
    expect(byPath.get(".speeq/setup.json")?.content).toContain('"provider": "groq"');
    const env = byPath.get(".env.local")?.content ?? "";
    expect(env).toContain("GROQ_API_KEY=\n");
    expect(env).toContain("SPEEQ_LLM_MODEL=\n");
    expect(env).toMatch(/SPEEQ_SECRET=\S{48}\n/);
    expect(byPath.get(".env.example")?.content).toContain("SPEEQ_SECRET=\n");
    const config = byPath.get("speeq.config.ts")?.content ?? "";
    expect(config).toContain("https://api.groq.com/openai/v1");
    expect(config).toContain('languages: ["en-IN","te-IN"]');
    expect(plan.manual.some((m) => m.title.includes("provider to your root layout"))).toBe(false);
  });
  it("never prints the generated secret in a diff", async () => {
    const p = await ready();
    const plan = await p.plan(undefined, setup);
    const secret = /SPEEQ_SECRET=(\S{48})/.exec(
      plan.changes.find((c) => c.path === ".env.local")?.content ?? "",
    )?.[1];
    expect(secret).toBeTruthy();
    const diff = renderDiff(plan);
    expect(diff).not.toContain(secret as string);
    expect(diff).toContain("SPEEQ_SECRET=<generated>");
  });
  it("is idempotent: a second plan changes nothing, even after the user filled in a key", async () => {
    const p = await ready();
    expect((await applyPlan(p.fs, await p.plan(undefined, setup))).status).toBe("applied");
    await p.scan();
    const env = await p.read(".env.local");
    await p.write(".env.local", env.replace("GROQ_API_KEY=\n", "GROQ_API_KEY=gsk_secret_value\n"));
    const again = await p.plan(undefined, setup);
    // The CLI drops capabilities found in speeq's own files before planning (covered in the CLI test
    // "a second init changes nothing"), so the raw scan used here may still refresh the manifest.
    expect(
      again.changes.filter((c) => c.action !== "keep" && c.path !== ".speeq/manifest.json"),
    ).toEqual([]);
  });
  it("rolls back the layout byte for byte, removes untouched env blocks and keeps filled-in keys", async () => {
    const p = await ready();
    await p.write(".env.local", "EXISTING=1\n");
    const before = await snapshot(p.dir);
    expect((await applyPlan(p.fs, await p.plan(undefined, setup))).status).toBe("applied");
    expect(await p.read("app/layout.tsx")).toContain("<SpeeqAssistant />");
    expect(await p.read(".env.local")).toContain("EXISTING=1");
    const r = await rollback(p.fs, "");
    expect(r.status).toBe("done");
    const after = await snapshot(p.dir);
    for (const key of Object.keys(before)) expect(after[key]).toBe(before[key]);
    expect(await p.read(".env.local")).toBe("EXISTING=1\n");

    // Second run: the user pastes a key, so rollback must leave that file alone.
    await p.scan();
    await applyPlan(p.fs, await p.plan(undefined, setup));
    const env = await p.read(".env.local");
    await p.write(".env.local", env.replace("GROQ_API_KEY=\n", "GROQ_API_KEY=gsk_keep_me\n"));
    const partial = await rollback(p.fs, "");
    expect(partial.status).toBe("partial");
    expect(await p.read(".env.local")).toContain("gsk_keep_me");
    expect(await p.read("app/layout.tsx")).toBe(LAYOUT);
  });
  it("prints the snippet instead of editing a layout it does not understand", async () => {
    const p = await ready();
    await p.write("app/layout.tsx", "export default function L() { return null; }\n");
    const plan = await p.plan(undefined, setup);
    expect(plan.changes.find((c) => c.path === "app/layout.tsx")).toBeUndefined();
    expect(plan.manual.some((m) => m.snippet.includes("<SpeeqAssistant />"))).toBe(true);
  });
  it("does nothing extra without the options (library defaults are unchanged)", async () => {
    const p = await ready();
    const plan = await p.plan(undefined);
    const paths = plan.changes.map((c) => c.path);
    expect(paths).not.toContain(".env.local");
    expect(paths).not.toContain("components/speeq/assistant.tsx");
  });
});
