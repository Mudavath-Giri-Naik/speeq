/** Supported host package managers. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";
/** Prefer declared managers to the nearest recognized lockfile. */
export function packageManager(
  fields: unknown[],
  files: ReadonlySet<string>,
  prefix: string,
): PackageManager {
  for (const field of fields) {
    const m = typeof field === "string" && /^(npm|pnpm|yarn|bun)(?:@|$)/.exec(field);
    if (m) return m[1] as PackageManager;
  }
  for (const dir of [prefix, ""])
    for (const [f, m] of [
      ["pnpm-lock.yaml", "pnpm"],
      ["package-lock.json", "npm"],
      ["yarn.lock", "yarn"],
      ["bun.lock", "bun"],
      ["bun.lockb", "bun"],
    ] as const)
      if (files.has(dir + f)) return m;
  return "unknown";
}
