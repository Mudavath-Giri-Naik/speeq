/** Inputs for the development registry check. */
export interface UpdateCheckOptions {
  currentVersion: string;
  env: Record<string, string | undefined>;
  enabled: boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

function parse(version: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/.exec(
    version,
  );
  if (!match) return;
  const pre = match[4]?.split(".");
  const metadata = match[5]?.split(".") ?? [];
  if (
    [...(pre ?? []), ...metadata].some((id) => !/^[0-9A-Za-z-]+$/.test(id)) ||
    pre?.some((id) => /^0\d+$/.test(id))
  )
    return;
  return { numbers: match.slice(1, 4).map((n) => BigInt(n)), pre };
}

function order<T extends string | bigint>(a: T, b: T): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compares semantic versions without build metadata. Invalid input compares equal. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parse(a),
    right = parse(b);
  if (!left || !right) return 0;
  for (const [i, n] of left.numbers.entries()) {
    const result = order(n, right.numbers[i] ?? 0n);
    if (result) return result;
  }
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (const [i, id] of left.pre.entries()) {
    const other = right.pre[i];
    if (other === undefined) return 1;
    if (id === other) continue;
    const numeric = /^\d+$/.test(id),
      otherNumeric = /^\d+$/.test(other);
    if (numeric && otherNumeric) return order(BigInt(id), BigInt(other));
    if (numeric !== otherNumeric) return numeric ? -1 : 1;
    return order(id, other);
  }
  return left.pre.length < right.pre.length ? -1 : 0;
}

/** Checks the public registry tags once per invocation. Failures are silent. */
export async function checkForUpdate({
  currentVersion,
  env,
  enabled,
  fetchImpl,
  log,
}: UpdateCheckOptions): Promise<void> {
  if (
    !enabled ||
    env.NODE_ENV === "production" ||
    env.CI !== undefined ||
    env.SPEEQ_UPDATE_CHECK === "0" ||
    env.SPEEQ_TELEMETRY === "0" ||
    env.NEXT_RUNTIME === "edge"
  )
    return;
  try {
    const version = parse(currentVersion);
    if (!version) return;
    const response = await (fetchImpl ?? globalThis.fetch)(
      "https://registry.npmjs.org/-/package/speeq/dist-tags",
      { signal: AbortSignal.timeout(2000), redirect: "error", credentials: "omit" },
    );
    if (response.status !== 200) return;
    const tags = await response.json();
    const tag =
      (version.numbers[0] === 0n || version.pre) && Object.hasOwn(tags, "next") ? "next" : "latest";
    const newer = tags[tag];
    if (typeof newer === "string" && compareVersions(newer, currentVersion) > 0) {
      (log ?? console.info)(
        `[speeq] Update available: ${currentVersion} -> ${newer}. Run: npm i speeq@${tag}`,
      );
    }
  } catch {
    // Registry, timeout, parsing and host logging failures cannot affect the handler.
  }
}
