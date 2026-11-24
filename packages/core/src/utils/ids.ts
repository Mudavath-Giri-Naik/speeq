/**
 * Returns a random, URL-safe id such as `ses_3f9a…`. It uses `crypto.randomUUID()`, which is
 * available in browsers, Node 20+ and edge runtimes. Ids never encode user data.
 *
 * @param prefix - A short readable prefix such as `ses`, `evt` or `turn`.
 */
export function createId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}
