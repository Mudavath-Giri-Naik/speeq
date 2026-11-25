import { and, eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import { projects } from "../db/schema";
/** Creates a project with an unbiased random base62 public key. */
export async function createProject(db: Db, name: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "pk_";
  while (key.length < 27) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < 248) key += alphabet.charAt(byte % 62);
      if (key.length === 27) break;
    }
  }
  const [row] = await db.insert(projects).values({ name, key }).returning();
  if (!row) throw new Error("Project creation failed");
  return row;
}
/** Revokes future attribution with this project's key. */
export async function revokeProject(db: Db, id: string) {
  await db.update(projects).set({ revokedAt: new Date() }).where(eq(projects.id, id));
}
/** Finds the active project for a public key. */
export async function findActiveProjectByKey(db: Db | Tx, key: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.key, key), isNull(projects.revokedAt)));
  return row;
}
