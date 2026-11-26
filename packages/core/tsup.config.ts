import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "speech-http": "src/speech-http/index.ts",
    index: "src/index.ts",
    errors: "src/errors.ts",
    utils: "src/utils/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: "es2022",
});
