import { mkdir, readdir, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Everything the engine needs from a file system. Paths are POSIX and relative to the root. */
export interface ProjectFs {
  /** File text, or `undefined` when the file does not exist. */
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
  /** Removes a file. Missing files are ignored. */
  remove(path: string): Promise<void>;
  /** Names of the direct children of a directory (empty when missing). */
  list(dir: string): Promise<string[]>;
  /** Removes a directory tree. Only the engine's own backup folders are removed this way. */
  removeTree(dir: string): Promise<void>;
}

function clean(path: string): string {
  const parts = path.split("/");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (
    !path ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path) ||
    isAbsolute(path)
  )
    throw new Error(`Unsafe path: ${path}`);
  if (parts.some((p) => !p || p === "." || p === "..")) throw new Error(`Unsafe path: ${path}`);
  return path;
}

/** In-memory file system for tests. Records every write and removal in `log`. */
export function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const log: string[] = [];
  const fs: ProjectFs & { files: Map<string, string>; log: string[] } = {
    files,
    log,
    async read(p) {
      return files.get(clean(p));
    },
    async write(p, c) {
      files.set(clean(p), c);
      log.push(`write ${p}`);
    },
    async remove(p) {
      if (files.delete(clean(p))) log.push(`remove ${p}`);
    },
    async list(dir) {
      const prefix = `${clean(dir)}/`;
      return [
        ...new Set(
          [...files.keys()]
            .filter((f) => f.startsWith(prefix))
            .map((f) => f.slice(prefix.length).split("/")[0] as string),
        ),
      ].sort();
    },
    async removeTree(dir) {
      const prefix = `${clean(dir)}/`;
      for (const f of [...files.keys()]) if (f.startsWith(prefix)) files.delete(f);
    },
  };
  return fs;
}

/** A file system confined to `root`. Rejects `..`, absolute paths and symlinks that leave the root. */
export function nodeFs(root: string): ProjectFs {
  const base = resolve(root);
  const inside = (abs: string) => {
    const rel = relative(base, abs);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  const abs = (p: string) => {
    const full = join(base, ...clean(p).split("/"));
    if (!inside(full)) throw new Error(`Unsafe path: ${p}`);
    return full;
  };
  const checkReal = async (dir: string) => {
    const real = await realpath(dir);
    const realBase = await realpath(base);
    if (real !== realBase && !real.startsWith(realBase + sep))
      throw new Error("Path escapes the project");
  };
  async function pruneEmpty(dir: string) {
    for (let d = dir; inside(d); d = dirname(d)) {
      try {
        await rmdir(d);
      } catch {
        return;
      }
    }
  }
  return {
    async read(p) {
      try {
        return await readFile(abs(p), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
      }
    },
    async write(p, c) {
      const file = abs(p);
      await mkdir(dirname(file), { recursive: true });
      await checkReal(dirname(file));
      const tmp = `${file}.speeq-tmp`;
      await writeFile(tmp, c, "utf8");
      await rename(tmp, file);
    },
    async remove(p) {
      const file = abs(p);
      await rm(file, { force: true });
      await pruneEmpty(dirname(file));
    },
    async list(dir) {
      try {
        return (await readdir(abs(dir))).sort();
      } catch {
        return [];
      }
    },
    async removeTree(dir) {
      const target = abs(dir);
      await rm(target, { recursive: true, force: true });
      await pruneEmpty(dirname(target));
    },
  };
}
