/**
 * Dependency-direction rules for the speeq monorepo.
 *
 * Each published package lists which `@speeq/*` packages it may depend on (runtime + peer),
 * which ones it may import in source (some imports are bundled at build time), and which
 * third-party runtime dependencies are allowed.
 */
export interface PackageRule {
  /** `@speeq/*` packages allowed in `dependencies` / `peerDependencies`. */
  readonly internalDeps: readonly string[];
  /** `@speeq/*` packages allowed in `import` statements under `src/`. */
  readonly internalImports: readonly string[];
  /** Third-party packages allowed in `dependencies` / `peerDependencies`. */
  readonly externalDeps: readonly string[];
}

/** The rule table. Adding a package means adding a row here. */
export const RULES: Readonly<Record<string, PackageRule>> = {
  "@speeq/compiler": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: ["typescript", "ignore"],
  },
  "@speeq/integrate": {
    internalDeps: [
      "@speeq/core",
      "@speeq/compiler",
      "@speeq/server",
      "@speeq/store-memory",
      "@speeq/store-mongodb",
      "@speeq/testing",
    ],
    internalImports: [
      "@speeq/core",
      "@speeq/compiler",
      "@speeq/server",
      "@speeq/store-memory",
      "@speeq/store-mongodb",
      "@speeq/testing",
    ],
    externalDeps: ["typescript", "zod"],
  },
  "@speeq/cli": {
    internalDeps: ["@speeq/core", "@speeq/compiler", "@speeq/integrate"],
    internalImports: ["@speeq/core", "@speeq/compiler", "@speeq/integrate"],
    externalDeps: ["@clack/prompts", "picocolors"],
  },
  "@speeq/core": { internalDeps: [], internalImports: [], externalDeps: ["zod"] },
  "@speeq/server": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: ["zod"],
  },
  // client bundles the zod-free parts of core at build time: zero runtime dependencies.
  "@speeq/client": { internalDeps: [], internalImports: ["@speeq/core"], externalDeps: [] },
  "@speeq/react": {
    internalDeps: ["@speeq/client"],
    internalImports: ["@speeq/client"],
    externalDeps: ["react"],
  },
  "@speeq/testing": {
    internalDeps: ["@speeq/core", "@speeq/server"],
    internalImports: ["@speeq/core", "@speeq/server"],
    externalDeps: ["zod", "vitest"],
  },
  "@speeq/llm-openai-compatible": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: [],
  },
  "@speeq/llm-gemini": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: [],
  },
  "@speeq/store-memory": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: [],
  },
  "@speeq/store-mongodb": {
    internalDeps: ["@speeq/core"],
    internalImports: ["@speeq/core"],
    externalDeps: ["mongodb"],
  },
};

/** Runtime packages the umbrella may depend on and re-export. */
export const runtimePackageNames = [
  ...Object.keys(RULES).filter(
    (name) => !["@speeq/compiler", "@speeq/integrate", "@speeq/cli"].includes(name),
  ),
  "@speeq/speech",
];
