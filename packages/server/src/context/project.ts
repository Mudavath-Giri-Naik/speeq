import { isRestrictedName, looksSecret, safeJsonStringify } from "@speeq/core";

/** A parsed `expose` list: `true` keeps the whole value, `[]` is "every array item". */
export type Tree = { [key: string]: Tree | true };

const PATH_RE = /^(\[\]|[A-Za-z_$][\w$-]{0,63})((\.[A-Za-z_$][\w$-]{0,63})|(\[\]))*$/;

/** Is `path` a valid expose path such as `items[].title`? */
export function isExposePath(path: string): boolean {
  return PATH_RE.test(path);
}

function segments(path: string): string[] {
  return path
    .replace(/\[\]/g, ".[]")
    .split(".")
    .filter((s) => s !== "");
}

/** Builds the projection tree. A shorter path wins over a longer one below it. */
export function exposeTree(paths: readonly string[]): Tree {
  const root: Tree = {};
  for (const path of paths) {
    let node: Tree = root;
    const parts = segments(path);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string;
      const next: Tree | true | undefined = node[part];
      if (next === true) break; // a parent is already exposed whole
      if (i === parts.length - 1) {
        node[part] = true;
        break;
      }
      if (next) node = next;
      else {
        const created: Tree = {};
        node[part] = created;
        node = created;
      }
    }
  }
  return root;
}

/** What screening removed, for logs and tests. Values never leave this module. */
export interface Screened {
  value: unknown;
  dropped: number;
}

const MAX_STRING = 500;
const MAX_DEPTH = 8;

/**
 * Keeps only what the tree allows, then removes restricted names, secret-looking strings and
 * anything deeper than 8 levels. Strings are cut to 500 characters. Never returns the input object.
 */
export function project(
  value: unknown,
  tree: Tree | true,
  extraSensitive: readonly string[] = [],
): Screened {
  const blocked = new Set(extraSensitive.map(normal));
  let dropped = 0;
  const restricted = (key: string) => isRestrictedName(key) || blocked.has(normal(key));

  const screen = (v: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) {
      dropped++;
      return undefined;
    }
    if (typeof v === "string") {
      if (looksSecret(v)) {
        dropped++;
        return undefined;
      }
      return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
    }
    if (v === null || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.map((x) => screen(x, depth + 1)).filter((x) => x !== undefined);
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if (restricted(k)) {
          dropped++;
          continue;
        }
        const s = screen(x, depth + 1);
        if (s !== undefined) out[k] = s;
      }
      return out;
    }
    return undefined; // functions, symbols, bigint, undefined
  };

  const walk = (v: unknown, node: Tree | true, depth: number): unknown => {
    if (node === true) return screen(v, depth);
    if (Array.isArray(v)) {
      const item = node["[]"];
      if (!item) return undefined;
      return v.map((x) => walk(x, item, depth + 1)).filter((x) => x !== undefined);
    }
    if (v === null || typeof v !== "object") return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      if (key === "[]" || restricted(key)) continue;
      if (!Object.hasOwn(v, key)) continue;
      const s = walk((v as Record<string, unknown>)[key], child, depth + 1);
      if (s !== undefined) out[key] = s;
    }
    return out;
  };

  const value_ = walk(value, tree, 0);
  return { value: value_, dropped };
}

function normal(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

/** Result of {@link bound}. */
export interface Bounded {
  value: unknown;
  text: string;
  truncated: boolean;
}

function cutArrays(v: unknown, max: number): { value: unknown; cut: boolean } {
  let cut = false;
  const go = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      if (x.length > max) cut = true;
      return x.slice(0, max).map(go);
    }
    if (x && typeof x === "object")
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, go(y)]));
    return x;
  };
  return { value: go(v), cut };
}

/**
 * Limits arrays to `maxItems` and the JSON to `maxChars`, halving arrays until it fits. If even
 * single items are too large, the result is replaced by a note, never by broken JSON.
 */
export function bound(value: unknown, maxItems: number, maxChars: number): Bounded {
  let { value: v, cut } = cutArrays(value, maxItems);
  let text = safeJsonStringify(v);
  let items = maxItems;
  while (text.length > maxChars && items > 1) {
    items = Math.max(1, Math.floor(items / 2));
    v = cutArrays(v, items).value;
    cut = true;
    text = safeJsonStringify(v);
  }
  if (text.length > maxChars) {
    v = { note: "This data is too large to show. Ask the user to narrow the question." };
    text = safeJsonStringify(v);
    cut = true;
  }
  return { value: v, text, truncated: cut };
}

/**
 * Serializes data for a prompt block so it cannot close or open tags there: `<` and `>` are
 * escaped. The model reads `&lt;` fine; the text stays data.
 */
export function neutralize(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
