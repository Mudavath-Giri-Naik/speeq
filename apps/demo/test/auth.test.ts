import { createHmac } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { signInAdmin, signInStudent, signOut } from "../app/login/actions";
import Login from "../app/login/page";
import {
  checkAdminPassword,
  DEMO_COOKIE,
  DEMO_SESSION_SECONDS,
  demoAuthSecret,
  getCurrentUser,
  readDemoUser,
  signDemoSession,
  verifyDemoSession,
} from "../lib/demo-auth";

const jar = vi.hoisted(() => ({
  get: vi.fn<(name: string) => { value: string } | undefined>(),
  set: vi.fn<(name: string, value: string, options: Record<string, unknown>) => void>(),
  delete: vi.fn<(name: string) => void>(),
}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({
  redirect(location: string): never {
    throw new Error(location);
  },
}));

const now = 1_750_000_000;
const secret = "explicit-demo-auth-test-secret-32-chars";
const student = { id: "student-1", name: "Asha", role: "student" };
const production = { NODE_ENV: "production" as const };
const development = { NODE_ENV: "development" as const };

// Independent signer for claims the app itself would never issue.
function signed(json: string) {
  const payload = Buffer.from(json).toString("base64url");
  const key = createHmac("sha256", secret).update("speeq-demo-auth-v1").digest();
  const signature = createHmac("sha256", key).update(payload, "ascii").digest("base64url");
  return `${payload}.${signature}`;
}
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SPEEQ_SECRET", secret);
  vi.stubEnv("DEMO_ADMIN_PASSWORD", "");
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("A01: signs the exact domain-separated format, seven-day expiry and student identity", async () => {
  const session = await signDemoSession("student-1", secret, now);
  expect(session).toBe(
    signed(JSON.stringify({ sub: "student-1", exp: now + DEMO_SESSION_SECONDS })),
  );
  expect(DEMO_SESSION_SECONDS).toBe(604_800);
  expect(await verifyDemoSession(session, secret, now)).toEqual(student);
});

it("A02: rejects changed payloads/signatures, a wrong key, expiry and unknown subject", async () => {
  const session = await signDemoSession("student-1", secret, now);
  const [payload, signature] = session.split(".");
  const changed = Buffer.from(JSON.stringify({ sub: "admin", exp: now + 60 })).toString(
    "base64url",
  );
  const changedSig = (signature?.startsWith("a") ? "b" : "a") + signature?.slice(1);
  const unknown = await signDemoSession("unknown", secret, now);
  expect(await verifyDemoSession(`${changed}.${signature}`, secret, now)).toBeNull();
  expect(await verifyDemoSession(`${payload}.${changedSig}`, secret, now)).toBeNull();
  expect(await verifyDemoSession(session, "wrong", now)).toBeNull();
  expect(await verifyDemoSession(session, secret, now + DEMO_SESSION_SECONDS)).toBeNull();
  expect(await verifyDemoSession(unknown, secret, now)).toBeNull();
});

it("A03: ignores signed extra claims and takes the role from the fixed list", async () => {
  const session = signed(JSON.stringify({ sub: "student-1", exp: now + 1, role: "admin" }));
  expect(await verifyDemoSession(session, secret, now)).toEqual(student);
});

it("A04: returns null for malformed values, encodings, payloads and expiry types", async () => {
  for (const value of [
    undefined,
    "",
    "nodot",
    "two.dots.here",
    "?.x",
    "A.A",
    "e30=.abc",
    signed("not JSON"),
    signed("null"),
    signed(JSON.stringify({ sub: 1, exp: now + 1 })),
    signed(JSON.stringify({ sub: "student-1", exp: String(now + 1) })),
  ]) {
    expect(await verifyDemoSession(value, secret, now)).toBeNull();
  }
});

it("A05: handles spaced Cookie headers and Next cookies, including missing values", async () => {
  const session = await signDemoSession("student-1", secret, now);
  expect(await readDemoUser(new Request("http://localhost"))).toBeNull();
  expect(
    await readDemoUser(
      new Request("http://localhost", {
        headers: { Cookie: `first=x; ${DEMO_COOKIE} = ${session} ; last=y=z` },
      }),
    ),
  ).toEqual(student);
  expect(await getCurrentUser()).toBeNull();
  jar.get.mockReturnValue({ value: session });
  expect(await getCurrentUser()).toEqual(student);
  expect(jar.get).toHaveBeenCalledWith(DEMO_COOKIE);
});

it("A06: trims env values and fails closed in production without a secret", async () => {
  expect(demoAuthSecret(development)).toBe("speeq-demo-dev-secret-not-for-production");
  expect(demoAuthSecret({ ...production, SPEEQ_SECRET: "   " })).toBeNull();
  expect(demoAuthSecret({ ...production, SPEEQ_SECRET: "  configured  " })).toBe("configured");
  await expect(signDemoSession("student-1", "", now)).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
    message: "Server is not configured",
  });
  const valid = await signDemoSession("student-1", secret, now);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SPEEQ_SECRET", "");
  jar.get.mockReturnValue({ value: valid });
  expect(await getCurrentUser()).toBeNull();
  expect(
    await readDemoUser(
      new Request("http://localhost", { headers: { Cookie: `${DEMO_COOKIE}=${valid}` } }),
    ),
  ).toBeNull();
  const markup = renderToStaticMarkup(await Login({ searchParams: Promise.resolve({}) }));
  expect(markup).toContain("Server is not configured");
  await expect(signInStudent(form({ student: "student-1" }))).rejects.toThrow(
    "/login?error=configuration",
  );
  expect(jar.set).not.toHaveBeenCalled();
});

it("A07: enables the default password only in development and trims configured passwords", () => {
  expect(checkAdminPassword("admin", development)).toBe(true);
  expect(checkAdminPassword("wrong", development)).toBe(false);
  expect(checkAdminPassword("admin", production)).toBe(false);
  expect(
    checkAdminPassword("demo-pass", { ...production, DEMO_ADMIN_PASSWORD: " demo-pass " }),
  ).toBe(true);
  expect(
    checkAdminPassword(" demo-pass ", { ...production, DEMO_ADMIN_PASSWORD: "demo-pass" }),
  ).toBe(false);
});

it("A08: allows only students and issues the exact development cookie before redirecting home", async () => {
  await expect(signInStudent(form({ student: "admin" }))).rejects.toThrow("/login?error=student");
  await expect(signInStudent(form({ student: "unknown" }))).rejects.toThrow("/login?error=student");
  expect(jar.set).not.toHaveBeenCalled();
  await expect(
    signInStudent(form({ student: "student-1", next: "https://example.test" })),
  ).rejects.toThrow(/^\/$/);
  expect(jar.set).toHaveBeenCalledWith(
    DEMO_COOKIE,
    signed(JSON.stringify({ sub: "student-1", exp: now + DEMO_SESSION_SECONDS })),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 604_800,
    },
  );
});

it("A09: waits 500 ms on a wrong password and disables an unconfigured production admin", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const markup = renderToStaticMarkup(
    await Login({ searchParams: Promise.resolve({ error: "password" }) }),
  );
  expect(markup).not.toContain('type="password"');
  expect(markup).toContain("Incorrect admin password.");
  let finished = false;
  const rejected = expect(
    signInAdmin(form({ password: "admin" })).finally(() => {
      finished = true;
    }),
  ).rejects.toThrow("/login?error=password");
  await vi.advanceTimersByTimeAsync(499);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(jar.set).not.toHaveBeenCalled();
});

it("A10: accepts only the configured production password and issues a secure admin cookie", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEMO_ADMIN_PASSWORD", " example-password ");
  await expect(
    signInAdmin(form({ password: "example-password", next: "/pricing" })),
  ).rejects.toThrow(/^\/$/);
  expect(jar.set).toHaveBeenCalledWith(DEMO_COOKIE, expect.any(String), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: DEMO_SESSION_SECONDS,
  });
  expect(await verifyDemoSession(jar.set.mock.lastCall?.[1], secret, now)).toEqual({
    id: "admin",
    name: "Demo admin",
    role: "admin",
  });
});

it("A11: deletes the demo cookie on sign-out and redirects home", async () => {
  await expect(signOut()).rejects.toThrow(/^\/$/);
  expect(jar.delete).toHaveBeenCalledExactlyOnceWith(DEMO_COOKIE);
});
