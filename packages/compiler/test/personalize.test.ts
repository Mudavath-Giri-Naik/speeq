import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPersonalization, scan } from "../src/index.js";

/* Release 0.12 discovery (task 026): auth bindings, customer data sources, business facts. */

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function app(files: Record<string, string>, deps: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "speeq-personal-"));
  dirs.push(dir);
  const all: Record<string, string> = {
    "package.json": JSON.stringify(
      { name: "demo-app", dependencies: { next: "^15.0.0", react: "^19.0.0", ...deps } },
      null,
      2,
    ),
    "app/page.tsx": "export default function Page() { return null; }\n",
    ...files,
  };
  for (const [f, text] of Object.entries(all)) {
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await writeFile(join(dir, f), text);
  }
  const r = await scan({ root: dir });
  if (r.status !== "ok") throw new Error(r.status);
  return discoverPersonalization({ root: dir, manifest: r.manifest });
}

const route = (body: string) => `import { NextResponse } from "next/server";\n${body}\n`;

describe("auth discovery", () => {
  it("binds Auth.js v5 from the exported auth() with evidence", async () => {
    const p = await app(
      {
        "auth.ts":
          'import NextAuth from "next-auth";\nexport const { handlers, auth, signIn, signOut } = NextAuth({ providers: [] });\n',
        "app/login/page.tsx": "export default function Login() { return null; }\n",
      },
      { "next-auth": "^5.0.0-beta.25" },
    );
    const c = p.auth.candidates[0];
    expect(c).toMatchObject({
      provider: "authjs",
      level: "implementation-detected",
      entry: { kind: "authjs", file: "auth.ts", exportName: "auth" },
    });
    expect(c?.evidence[0]).toMatchObject({ file: "auth.ts", line: 2 });
    expect(p.auth.recommended).toBe(0);
    expect(p.auth.loginRoutes).toEqual(["/login"]);
  });

  it("binds NextAuth v4 authOptions from a library file, but not from a route file", async () => {
    const lib = await app(
      {
        "lib/auth.ts":
          'import type { NextAuthOptions } from "next-auth";\nexport const authOptions: NextAuthOptions = { providers: [] };\n',
      },
      { "next-auth": "^4.24.0" },
    );
    expect(lib.auth.candidates[0]).toMatchObject({
      provider: "nextauth-v4",
      level: "implementation-detected",
      entry: { kind: "nextauth-v4", file: "lib/auth.ts", exportName: "authOptions" },
    });
    const inRoute = await app(
      {
        "app/api/auth/[...nextauth]/route.ts":
          'import NextAuth from "next-auth";\nexport const authOptions = { providers: [] };\nconst handler = NextAuth(authOptions);\nexport { handler as GET, handler as POST };\n',
      },
      { "next-auth": "^4.24.0" },
    );
    const c = inRoute.auth.candidates[0];
    expect(c?.level).toBe("requires-review");
    expect(c?.entry).toBeUndefined();
    expect(c?.notes.join(" ")).toMatch(/Move it to lib\/auth.ts/);
    expect(inRoute.auth.recommended).toBeUndefined();
  });

  it("binds the Supabase server client", async () => {
    const p = await app(
      {
        "utils/supabase/server.ts":
          'import { createServerClient } from "@supabase/ssr";\nimport { cookies } from "next/headers";\nexport async function createClient() {\n  const store = await cookies();\n  return createServerClient("u", "k", { cookies: { getAll: () => store.getAll(), setAll: () => {} } });\n}\n',
      },
      { "@supabase/ssr": "^0.5.0", "@supabase/supabase-js": "^2.45.0" },
    );
    expect(p.auth.candidates[0]).toMatchObject({
      provider: "supabase",
      level: "implementation-detected",
      entry: { kind: "supabase", file: "utils/supabase/server.ts", exportName: "createClient" },
    });
  });

  it("binds Clerk only when clerkMiddleware runs", async () => {
    const withMw = await app(
      {
        "middleware.ts":
          'import { clerkMiddleware } from "@clerk/nextjs/server";\nexport default clerkMiddleware();\n',
      },
      { "@clerk/nextjs": "^6.0.0" },
    );
    expect(withMw.auth.candidates[0]).toMatchObject({
      provider: "clerk",
      level: "implementation-detected",
      entry: { kind: "clerk" },
      tenants: true,
    });
    const without = await app({}, { "@clerk/nextjs": "^6.0.0" });
    expect(without.auth.candidates[0]).toMatchObject({
      provider: "clerk",
      level: "provider-detected",
    });
    expect(without.auth.candidates[0]?.entry).toBeUndefined();
  });

  it("binds Better Auth", async () => {
    const p = await app(
      {
        "lib/auth.ts":
          'import { betterAuth } from "better-auth";\nexport const auth = betterAuth({});\n',
      },
      { "better-auth": "^1.0.0" },
    );
    expect(p.auth.candidates[0]).toMatchObject({
      provider: "better-auth",
      level: "implementation-detected",
      entry: { kind: "better-auth", file: "lib/auth.ts", exportName: "auth" },
    });
  });

  it("never claims a binding from an installed package alone", async () => {
    const p = await app({}, { "next-auth": "^5.0.0-beta.25" });
    expect(p.auth.candidates[0]).toMatchObject({ provider: "authjs", level: "provider-detected" });
    expect(p.auth.candidates[0]?.entry).toBeUndefined();
    expect(p.auth.recommended).toBeUndefined();
  });

  it("reports Firebase as unsupported with what to do", async () => {
    const p = await app({}, { firebase: "^11.0.0" });
    expect(p.auth.candidates[0]).toMatchObject({ provider: "firebase", level: "unsupported" });
    expect(p.auth.candidates[0]?.notes[0]).toMatch(/firebase-admin/);
  });

  it("flags the app's own user helper for review, never binds it", async () => {
    const p = await app({
      "lib/session.ts": "export async function getCurrentUser() { return null; }\n",
    });
    expect(p.auth.candidates).toEqual([
      expect.objectContaining({ provider: "custom", level: "requires-review" }),
    ]);
    expect(p.auth.candidates[0]?.entry).toBeUndefined();
  });

  it("finds nothing on a static site and creates no identity", async () => {
    const p = await app({});
    expect(p.auth.candidates).toEqual([]);
    expect(p.dataSources).toEqual([]);
  });
});

describe("customer data sources", () => {
  it("suggests sources from GET endpoints with fields, auth and scope evidence", async () => {
    const p = await app(
      {
        "auth.ts":
          'import NextAuth from "next-auth";\nexport const { auth } = NextAuth({ providers: [] });\n',
        "app/api/cart/route.ts": route(
          'import { auth } from "../../../auth";\nexport async function GET() {\n  const session = await auth();\n  const items = await getCart(session?.user?.id);\n  return NextResponse.json({ items, count: items.length, paymentToken: "x" });\n}\ndeclare function getCart(id?: string): Promise<unknown[]>;',
        ),
        "app/api/orders/[id]/route.ts": route(
          "export async function GET() { return NextResponse.json({ status: 'shipped' }); }",
        ),
        "app/api/auth/session/route.ts": route(
          "export async function GET() { return NextResponse.json({}); }",
        ),
        "app/api/products/route.ts": route(
          "export async function GET() { return NextResponse.json({ products: [] }); }",
        ),
        "app/api/me/route.ts": route(
          "export async function GET() { return NextResponse.json({ name: 'x' }); }",
        ),
      },
      { "next-auth": "^5.0.0-beta.25" },
    );
    const byPath = Object.fromEntries(p.dataSources.map((d) => [d.path, d]));
    expect(Object.keys(byPath).sort()).toEqual(["/api/cart", "/api/me", "/api/orders/[id]"]);
    expect(byPath["/api/cart"]).toMatchObject({
      id: "cart",
      category: "commerce",
      binding: "bindable",
      authEvidence: "helper-called",
      customerScope: "user-referenced",
      fields: [
        { name: "items", sensitive: false },
        { name: "count", sensitive: false },
        { name: "paymentToken", sensitive: true },
      ],
    });
    expect(byPath["/api/orders/[id]"]).toMatchObject({
      category: "commerce",
      binding: "requires-binding",
      requiredInputs: ["id"],
      authEvidence: "none-found",
    });
    expect(byPath["/api/me"]).toMatchObject({ category: "identity", authEvidence: "none-found" });
  });
});

describe("business facts", () => {
  it("prefers layout metadata, with evidence", async () => {
    const p = await app({
      "app/layout.tsx":
        'export const metadata = { title: "SwaSeekh", description: "GATE preparation with previous-year questions and courses." };\nexport default function Root({ children }: { children: React.ReactNode }) { return children; }\n',
      "app/courses/page.tsx":
        'export const metadata = { title: "Courses" };\nexport default function C() { return null; }\n',
    });
    expect(p.business.name).toMatchObject({
      value: "SwaSeekh",
      evidence: { file: "app/layout.tsx", detector: "layout-metadata" },
    });
    expect(p.business.description?.value).toMatch(/GATE preparation/);
    expect(p.business.needsDescription).toBe(false);
    expect(p.business.pages.map((x) => x.path)).toContain("/courses");
  });

  it("uses the README, treats a package name only as a hint, and asks when unsure", async () => {
    const readme = await app({
      "README.md":
        "# Kirana Mart\n\n![badge](x)\n\nKirana Mart delivers groceries in Hyderabad within 30 minutes.\n",
      "app/layout.tsx":
        'export const metadata = { title: "Create Next App", description: "Generated by create next app" };\nexport default function R() { return null; }\n',
    });
    expect(readme.business.name).toMatchObject({
      value: "Kirana Mart",
      evidence: { detector: "readme-heading" },
    });
    expect(readme.business.description?.value).toMatch(/delivers groceries/);
    const bare = await app({});
    expect(bare.business.name).toMatchObject({
      value: "Demo App",
      evidence: { detector: "package-name" },
    });
    expect(bare.business.description).toBeUndefined();
    expect(bare.business.needsDescription).toBe(true);
  });
});
