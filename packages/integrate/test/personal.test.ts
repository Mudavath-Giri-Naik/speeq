import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthEntry, DataSourceCandidate } from "@speeq/compiler";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { authStatus, contextSpec, renderContext, renderIdentity } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const umbrella = join(here, "..", "..", "speeq", "src");
const norm = (s: string) => s.split("\\").join("/");

const cart: DataSourceCandidate = {
  id: "cart",
  title: "Cart",
  capabilityId: "endpoint:GET /api/cart",
  type: "endpoint",
  method: "GET",
  path: "/api/cart",
  location: { file: "app/api/cart/route.ts", line: 2 },
  category: "commerce",
  because: "path /api/cart",
  fields: [
    { name: "items", sensitive: false },
    { name: "count", sensitive: false },
    { name: "paymentToken", sensitive: true },
  ],
  requiredInputs: [],
  authEvidence: "helper-called",
  customerScope: "user-referenced",
  binding: "bindable",
  evidence: [],
};

describe("context source specs", () => {
  it("accepts approved, known, non-sensitive fields", () => {
    const r = contextSpec(cart, { fields: ["items", "count"], greeting: ["count", "nope"] });
    expect(r).toEqual({
      ok: true,
      spec: {
        id: "cart",
        description: "Cart of the signed-in customer",
        category: "commerce",
        path: "/api/cart",
        expose: ["items", "count"],
        load: "on-demand",
        auth: "required",
        greeting: ["count"],
      },
    });
  });

  it("never approves a sensitive field, even nested", () => {
    for (const f of ["paymentToken", "items[].password", "profile.apiKey"]) {
      const r = contextSpec({ ...cart, fields: [] }, { fields: [f] });
      expect(r).toMatchObject({ ok: false, reason: "sensitive-field" });
    }
  });

  it("refuses unknown fields, empty choices and parameterised endpoints", () => {
    expect(contextSpec(cart, { fields: ["total"] })).toMatchObject({
      ok: false,
      reason: "unknown-field",
    });
    expect(contextSpec(cart, { fields: [] })).toMatchObject({ ok: false, reason: "no-fields" });
    expect(
      contextSpec(
        { ...cart, binding: "requires-binding", requiredInputs: ["id"] },
        { fields: ["items"] },
      ),
    ).toMatchObject({ ok: false, reason: "requires-binding" });
  });

  it("needs an explicit review when the endpoint shows no sign-in check", () => {
    const open = { ...cart, authEvidence: "none-found" as const };
    expect(contextSpec(open, { fields: ["items"] })).toMatchObject({
      ok: false,
      reason: "auth-not-reviewed",
    });
    expect(contextSpec(open, { fields: ["items"], authReviewed: true })).toMatchObject({
      ok: true,
    });
  });

  it("maps discovery levels to statuses without claiming more", () => {
    expect(authStatus(undefined)).toBe("not-found");
    expect(
      authStatus({
        provider: "authjs",
        label: "",
        level: "provider-detected",
        profileFields: [],
        tenants: false,
        evidence: [],
        notes: [],
      }),
    ).toBe("provider-detected");
    expect(
      authStatus({
        provider: "authjs",
        label: "",
        level: "implementation-detected",
        profileFields: [],
        tenants: false,
        evidence: [],
        notes: [],
      }),
    ).toBe("ready");
  });
});

/** Minimal type stubs of the auth libraries, shaped like their public server APIs. */
const STUBS: Record<string, string> = {
  "stubs/next-auth.d.ts":
    'declare module "next-auth" {\n  export interface Session { user?: { name?: string | null; email?: string | null; image?: string | null } }\n  export interface NextAuthOptions { providers: unknown[] }\n  export function getServerSession(options: NextAuthOptions): Promise<Session | null>;\n}\n',
  "stubs/clerk.d.ts":
    'declare module "@clerk/nextjs/server" {\n  export function auth(): Promise<{ userId: string | null; orgId?: string | null }>;\n  export function currentUser(): Promise<{ firstName: string | null; fullName: string | null } | null>;\n}\n',
  "auth.ts":
    "type Session = { user?: { name?: string | null; email?: string | null } } | null;\nexport declare function auth(): Promise<Session>;\n",
  "lib/options.ts":
    'import type { NextAuthOptions } from "next-auth";\nexport const authOptions: NextAuthOptions = { providers: [] };\n',
  "utils/supabase/server.ts":
    "type AuthError = { name: string; status?: number };\ntype User = { id: string; user_metadata: Record<string, unknown> };\nexport declare function createClient(): Promise<{ auth: { getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }> } }>;\n",
  "lib/better.ts":
    "export declare const auth: { api: { getSession(o: { headers: Headers }): Promise<{ user: { id: string; name: string } } | null> } };\n",
};

describe("generated identity and context modules", () => {
  it("type-check against the real packages and the auth libraries' shapes", async () => {
    const dir = await mkdtemp(join(here, "..", ".gen-personal-"));
    try {
      const out = ".speeq/generated";
      const entries: [string, AuthEntry, boolean][] = [
        ["authjs", { kind: "authjs", file: "auth.ts", exportName: "auth" }, true],
        [
          "nextauth",
          { kind: "nextauth-v4", file: "lib/options.ts", exportName: "authOptions" },
          true,
        ],
        [
          "supabase",
          { kind: "supabase", file: "utils/supabase/server.ts", exportName: "createClient" },
          true,
        ],
        ["clerk", { kind: "clerk" }, true],
        ["clerk-bare", { kind: "clerk" }, false],
        ["better", { kind: "better-auth", file: "lib/better.ts", exportName: "auth" }, true],
      ];
      const files: Record<string, string> = { ...STUBS };
      for (const [name, entry, profile] of entries) {
        const file = `${out}/identity-${name}.ts`;
        files[file] = renderIdentity(entry, file, { profile });
      }
      const spec = contextSpec(cart, { fields: ["items", "count"], greeting: ["count"] });
      if (!spec.ok) throw new Error(spec.reason);
      files[`${out}/context.ts`] = renderContext([
        spec.spec,
        { ...spec.spec, id: "orders", path: "/api/orders" },
      ]);
      files[`${out}/context-empty.ts`] = renderContext([]);
      files["speeq.config.ts"] = [
        'import { createSpeeq } from "speeq/server";',
        'import { createMemoryStore } from "speeq/store-memory";',
        'import { FakeLLMProvider } from "speeq/testing";',
        `import { resolveUser } from "./${out}/identity-supabase";`,
        `import { contextProviders } from "./${out}/context";`,
        "export const speeq = createSpeeq({",
        '  agent: { name: "A", instructions: "x" },',
        "  llm: new FakeLLMProvider([]),",
        "  store: createMemoryStore(),",
        "  resolveUser,",
        "  context: { providers: contextProviders },",
        "});",
        "",
      ].join("\n");
      for (const [f, text] of Object.entries(files)) {
        await mkdir(dirname(join(dir, f)), { recursive: true });
        await writeFile(join(dir, f), text);
      }
      const roots = Object.keys(files).map((f) => join(dir, f));
      const program = ts.createProgram(roots, {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["@speeq/source"],
        paths: {
          "speeq/server/next": [join(umbrella, "server-next.ts")],
          "speeq/*": [join(umbrella, "*.ts")],
        },
        types: ["node"],
        lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
      });
      const base = norm(dir);
      const errors = ts
        .getPreEmitDiagnostics(program)
        .filter((x) => x.file && norm(x.file.fileName).startsWith(base))
        .map((x) => `${x.file?.fileName}: ${ts.flattenDiagnosticMessageText(x.messageText, "\n")}`);
      expect(errors).toEqual([]);
      // Generated text is data-quoted and imports nothing it does not use.
      expect(files[`${out}/identity-clerk-bare.ts`]).not.toContain("currentUser");
      expect(files[`${out}/context.ts`]).toContain("forwardAuth: true");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("never puts the user id into a profile, and calls getUser (not getSession) for Supabase", () => {
    const s = renderIdentity(
      { kind: "supabase", file: "u.ts", exportName: "createClient" },
      ".speeq/generated/identity.ts",
    );
    expect(s).toContain("supabase.auth.getUser()");
    expect(s).not.toContain("auth.getSession(");
    expect(s).toContain("throw error");
    const a = renderIdentity(
      { kind: "authjs", file: "auth.ts", exportName: "auth" },
      ".speeq/generated/identity.ts",
    );
    expect(a).toContain('from "../../auth"');
    expect(a).not.toMatch(/profile: \{[^}]*id/);
  });
});
