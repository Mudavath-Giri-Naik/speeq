import { posix } from "node:path";
import ts from "typescript";
/** Parse config through a virtual, repo-relative inventory. Resolve only workspace and relative parents. */
export function readConfig(
  file: string,
  configs: Map<string, string>,
  packages: Map<string, string>,
) {
  const virtual = "/repo/";
  const read = (name: string) => configs.get(name.slice(virtual.length));
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists: (n) => n.startsWith(virtual) && configs.has(n.slice(6)),
    readDirectory: () => [],
    readFile: (n) => (n.startsWith(virtual) ? read(n) : undefined),
  };
  function config(name: string, seen: Set<string>): Record<string, unknown> {
    if (seen.has(name) || seen.size > 32) throw Error("cycle");
    const text = configs.get(name);
    if (text === undefined) throw Error("missing config");
    const json = ts.parseConfigFileTextToJson(name, text);
    if (json.error || !json.config || typeof json.config !== "object")
      throw Error("invalid config");
    const data = { ...json.config };
    if (data.extends) {
      const rewritten = [];
      for (const spec of Array.isArray(data.extends) ? data.extends : [data.extends]) {
        if (typeof spec !== "string") throw Error("invalid extends");
        let target: string;
        if (spec.startsWith(".")) target = posix.join(posix.dirname(name), spec);
        else {
          const pkg = [...packages.keys()].find((k) => spec === k || spec.startsWith(k + "/"));
          if (!pkg) throw Error("external config");
          target = posix.join(
            packages.get(pkg) ?? "",
            spec.slice(pkg.length).replace(/^\//, "") || "tsconfig.json",
          );
        }
        if (!configs.has(target)) target += ".json";
        const parent = config(target, new Set([...seen, name]));
        normalized.set(virtual + target, JSON.stringify(parent));
        rewritten.push(virtual + target);
      }
      data.extends = rewritten;
    }
    return data;
  }
  const normalized = new Map<string, string>();
  try {
    const data = config(file, new Set());
    const parsed = ts.parseJsonConfigFileContent(
      data,
      {
        ...host,
        fileExists: (n) => normalized.has(n) || host.fileExists(n),
        readFile: (n) => normalized.get(n) ?? host.readFile(n),
      },
      posix.dirname(virtual + file),
      {},
      virtual + file,
    );
    if (parsed.errors.some((e) => ![18002, 18003].includes(e.code))) return;
    const opts = parsed.options;
    const base =
      opts.baseUrl ??
      (opts as { pathsBasePath?: string }).pathsBasePath ??
      posix.dirname(virtual + file);
    return {
      options: opts,
      info: {
        path: file,
        baseUrl: posix.relative("/repo", base) || ".",
        aliases: Object.entries(opts.paths ?? {}).map(([pattern, targets]) => ({
          pattern,
          targets,
        })),
      },
      references: (parsed.projectReferences ?? []).map((r) => posix.relative("/repo", r.path)),
    };
  } catch {
    return;
  }
}
