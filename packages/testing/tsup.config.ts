import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "store-contract": "src/store-contract.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: ["vitest"],
});
