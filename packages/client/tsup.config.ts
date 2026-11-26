import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";
import ts from "typescript";

// Materialize schema-inferred wire shapes without shipping the schema library.
const source = "../core/src/index.ts";
const program = ts.createProgram([source], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const checker = program.getTypeChecker();
const file = program.getSourceFile(source);
const moduleSymbol = file && checker.getSymbolAtLocation(file);
if (!moduleSymbol) throw new Error("Could not load core types");
const names = new Set([
  "ClientConfig",
  "ProtocolEvent",
  "SessionListResponse",
  "SessionDetailResponse",
  "SessionSummary",
  "ConversationEvent",
  "SessionFilter",
]);
const declarations = [
  'export type { SpeechInput, SpeechOutput } from "@speeq/core/speech";',
  'export type { CreateSessionResponse } from "@speeq/core/http";',
];
for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
  if (!names.has(symbol.name)) continue;
  const shape = checker.typeToString(
    checker.getDeclaredTypeOfSymbol(symbol),
    undefined,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
  );
  declarations.push(`export type ${symbol.name} = ${shape};`);
}
const cache = "./node_modules/.cache/speeq";
mkdirSync(cache, { recursive: true });
writeFileSync(`${cache}/wire.d.ts`, declarations.join("\n"));
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  noExternal: [/^@speeq\/core/],
  dts: {
    resolve: [/^@speeq\/core/],
    compilerOptions: {
      paths: {
        "@speeq/core": [`${cache}/wire.d.ts`],
        "@speeq/core/speech": ["../core/src/interfaces/speech.ts"],
        "@speeq/core/http": ["../core/src/schemas/http.ts"],
        "@speeq/core/utils": ["../core/src/utils/index.ts"],
        "@speeq/core/errors": ["../core/src/errors.ts"],
      },
    },
  },
  esbuildOptions(options) {
    options.conditions = ["@speeq/source"];
  },
  clean: true,
  sourcemap: true,
  target: "es2022",
});
