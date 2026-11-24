"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkAdminPassword,
  DEMO_COOKIE,
  DEMO_SESSION_SECONDS,
  DEMO_USERS,
  demoAuthSecret,
  signDemoSession,
} from "../../lib/demo-auth";

async function setSession(id: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const value = await signDemoSession(id, secret, now);
  (await cookies()).set(DEMO_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV?.trim() === "production",
    maxAge: DEMO_SESSION_SECONDS,
  });
  redirect("/");
}

/** Starts a demo session for one of the fixed student accounts. */
export async function signInStudent(form: FormData) {
  const secret = demoAuthSecret();
  if (!secret) redirect("/login?error=configuration");
  const id = form.get("student");
  const student = DEMO_USERS.find((user) => user.role === "student" && user.id === id);
  if (!student) redirect("/login?error=student");
  await setSession(student.id, secret);
}

/** Starts an admin session after checking the configured password. */
export async function signInAdmin(form: FormData) {
  const secret = demoAuthSecret();
  if (!secret) redirect("/login?error=configuration");
  const password = form.get("password");
  if (!checkAdminPassword(typeof password === "string" ? password : "")) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    redirect("/login?error=password");
  }
  await setSession("admin", secret);
}

/** Removes the demo session cookie and returns home. */
export async function signOut() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/");
}
