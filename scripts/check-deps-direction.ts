/**
 * Fails (exit 1) if any published package breaks the dependency-direction rules in
 * `deps-rules.ts`. Checks both `package.json` dependency fields and import specifiers in `src/`.
 *
 * Run: `pnpm check-deps` (also part of `pnpm lint` and CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type PackageRule, RULES, runtimePackageNames } from "./deps-rules.js";

/** Minimal view of a package.json for this check. */
export interface PackageManifest {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** A package under test: its manifest and its source files' contents. */
export interface PackageUnderCheck {
  dir: string;
  manifest: PackageManifest;
  sources: ReadonlyArray<{ file: string; code: string }>;
}

const IMPORT_RE =
  /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Returns the bare package name of an import specifier, or `null` for relative/node imports. */
export function packageNameOf(specifier: string): string | null {
  if (!specifier || /^(\.|\/|node:)/.test(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : (parts[0] ?? null);
}

const packageRules = {
  ...RULES,
  "@speeq/speech": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: [],
  },
  speeq: {
    internalDeps: runtimePackageNames,
    internalImports: runtimePackageNames,
    externalDeps: ["zod", "react", "mongodb"],
  },
};

/** Checks one package against its rule and returns human-readable violations. */
export function checkPackage(
  pkg: PackageUnderCheck,
  rules: Readonly<Record<string, PackageRule>> = packageRules,
): string[] {
  const rule: PackageRule | undefined = rules[pkg.manifest.name];
  if (!rule) return [`${pkg.manifest.name}: no rule in scripts/deps-rules.ts`];
  const problems: string[] = [];
  const declared = { ...pkg.manifest.dependencies, ...pkg.manifest.peerDependencies };
  for (const dep of Object.keys(declared)) {
    const allowed = dep.startsWith("@speeq/")
      ? rule.internalDeps.includes(dep)
      : rule.externalDeps.includes(dep);
    if (!allowed) problems.push(`${pkg.manifest.name}: dependency "${dep}" is not allowed`);
  }
  for (const { file, code } of pkg.sources) {
    // Ignore comments so JSDoc examples (e.g. `import { x } from "@/lib/x"`) are not checked.
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const match of stripped.matchAll(IMPORT_RE)) {
      const name = packageNameOf(match[1] ?? match[2] ?? match[3] ?? "");
      if (!name || name === pkg.manifest.name) continue;
      const ok = name.startsWith("@speeq/")
        ? rule.internalImports.includes(name)
        : rule.externalDeps.includes(name) && name in declared;
      if (!ok) problems.push(`${pkg.manifest.name}: ${file} imports "${name}" (not allowed)`);
    }
  }
  return problems;
}

function listFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function hasManifest(dir: string): boolean {
  try {
    return statSync(join(dir, "package.json")).isFile();
  } catch {
    return false;
  }
}

/** Loads every published package in the repo. */
export function loadRepoPackages(root: string): PackageUnderCheck[] {
  const dirs = [
    ...readdirSync(join(root, "packages")).map((d) => join(root, "packages", d)),
    ...readdirSync(join(root, "packages", "adapters")).map((d) =>
      join(root, "packages", "adapters", d),
    ),
  ].filter(hasManifest);
  return dirs.map((dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageManifest;
    const sources = listFiles(join(dir, "src")).map((file) => ({
      file: relative(root, file),
      code: readFileSync(file, "utf8"),
    }));
    return { dir, manifest, sources };
  });
}

/** Checks the whole repo and returns all violations. */
export function checkRepo(root: string): string[] {
  return loadRepoPackages(root).flatMap((pkg) => checkPackage(pkg));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(fileURLToPath(import.meta.url), "..", "..");
  const problems = checkRepo(root);
  if (problems.length > 0) {
    console.error(`Dependency-direction check failed:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Dependency-direction check passed.");
}
