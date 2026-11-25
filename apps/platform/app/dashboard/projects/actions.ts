"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "../../../db/client";
import { type AdminSession, requireAdmin } from "../../../lib/auth/session";
import { createProject, revokeProject } from "../../../lib/projects";

const failed = "/dashboard/projects?error=invalid";
/** Reauthorizes the submitted form before creating a project. */
export async function create(_renderSession: AdminSession, data: FormData) {
  await requireAdmin();
  const parsed = z.string().trim().min(1).max(80).safeParse(data.get("name"));
  if (!parsed.success) redirect(failed);
  try {
    await createProject(await getDb(), parsed.data);
  } catch {
    redirect(failed);
  }
  redirect("/dashboard/projects");
}
/** Reauthorizes the submitted form before revoking a public key. */
export async function revoke(_renderSession: AdminSession, data: FormData) {
  await requireAdmin();
  const parsed = z.uuid().safeParse(data.get("id"));
  if (!parsed.success) redirect(failed);
  try {
    await revokeProject(await getDb(), parsed.data);
  } catch {
    redirect(failed);
  }
  redirect("/dashboard/projects");
}
