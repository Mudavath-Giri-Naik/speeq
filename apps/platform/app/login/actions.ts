"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../../db/client";
import { adminCookie } from "../../lib/auth/cookie";
import { attemptLogin, clientIp } from "../../lib/auth/login";
import { requireAdmin } from "../../lib/auth/session";
/** Authenticates the submitted password and creates the session cookie. */
export async function login(data: FormData) {
  const raw = data.get("password");
  const result = await attemptLogin(
    { password: typeof raw === "string" ? raw : "", clientIp: clientIp(await headers()) },
    { db: getDb },
  );
  if (!result.ok)
    redirect(
      result.reason === "disabled"
        ? "/login"
        : result.reason === "throttled"
          ? "/login?error=throttled"
          : "/login?error=invalid",
    );
  (await cookies()).set({ ...adminCookie(), value: result.token });
  redirect("/dashboard");
}
/** Clears the verified session cookie. */
export async function logout() {
  await requireAdmin();
  (await cookies()).set({ ...adminCookie(true), value: "" });
  redirect("/login");
}
