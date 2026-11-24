import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  external: ["react", "react/jsx-runtime", "@speeq/client"],
  banner: { js: '"use client";' },
  clean: true,
  sourcemap: true,
  target: "es2022",
});
