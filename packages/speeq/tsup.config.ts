import { build } from "tsup";
import pkg from "./package.json" with { type: "json" };

// Isolate declaration builds as well as JavaScript. A joint declaration bundle
// can hoist unrelated external imports into the browser entry.
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  const name = subpath === "." ? "index" : subpath.slice(2);
  await build({
    config: false,
    entry: { [name]: entry["@speeq/source"] },
    format: ["esm", "cjs"],
    // The adapter itself uses only driver types. Link its peer at this entry so
    // Node reports a missing driver when the MongoDB integration is imported.
    esbuildOptions(options, { format }) {
      if (name === "store-mongodb") {
        options.banner = { js: format === "esm" ? 'import "mongodb";' : 'require("mongodb");' };
      }
    },
    dts: true,
    clean: subpath === ".",
    sourcemap: true,
    target: "es2022",
  });
}

// The executable: ESM only, no declarations. `@speeq/cli` stays an external dependency.
await build({
  config: false,
  entry: { bin: "src/bin.ts" },
  format: ["esm"],
  clean: false,
  sourcemap: true,
  target: "es2022",
});
