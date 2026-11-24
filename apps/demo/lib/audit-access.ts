import type { DemoUser } from "./demo-auth";

/** Checks whether the signed-in demo account can view conversation history. */
export function canViewAudit(user: DemoUser | null): boolean {
  return user?.role === "admin";
}
