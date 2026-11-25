#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
scratch=$(mktemp -d "$temp_root/speeq-pack.XXXXXXXX")
echo "Scratch app: $scratch"
cd "$scratch"
if [[ ${KEEP_PACK_TEST:-0} != 1 && $(pwd -P) == "$temp_root"/speeq-pack.* ]]; then
  trap 'cd "$root" && rm -rf -- "$scratch"' EXIT
fi
mkdir packs
cp "$root"/.packs/*.tgz packs/
node --input-type=module - "$root" <<'JS'
import fs from "node:fs";
import path from "node:path";
const root = process.argv[2];
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const repo = read("package.json");
const demo = read("apps/demo/package.json");
const libs = { ...repo.devDependencies, ...demo.dependencies, ...demo.devDependencies };
const deps = Object.fromEntries(["next","react","react-dom","typescript","zod","mongodb","vitest","@types/node","@types/react","@types/react-dom"].map(key => [key, libs[key]]));
const overrides = {};
let imports = "";
for (const parent of ["packages", "packages/adapters"]) {
  for (const dir of fs.readdirSync(path.join(root, parent))) {
    const manifest = path.join(parent, dir, "package.json");
    if (!fs.existsSync(path.join(root, manifest))) continue;
    const pkg = read(manifest);
    if (pkg.private) continue;
    overrides[pkg.name] = deps[pkg.name] = "file:./packs/" + pkg.name.slice(1).replace("/", "-") + "-" + pkg.version + ".tgz";
    for (const key of Object.keys(pkg.exports)) {
      imports += 'import "' + pkg.name + key.slice(1) + '";\n';
    }
  }
}
fs.writeFileSync("package.json", JSON.stringify({name:"speeq-guide-check",private:true,type:"module",packageManager:repo.packageManager,dependencies:deps}));
fs.writeFileSync("pnpm-workspace.yaml", JSON.stringify({overrides,allowBuilds:{esbuild:true,sharp:true}}));
fs.writeFileSync("tsconfig.json", JSON.stringify({compilerOptions:{target:"ES2022",module:"esnext",moduleResolution:"bundler",jsx:"react-jsx",strict:true,noEmit:true,skipLibCheck:true,noUncheckedSideEffectImports:true}}));
fs.writeFileSync("entries.ts", imports);
const guide = fs.readFileSync(path.join(root,"docs/guides/nextjs.md"),"utf8").replaceAll("\r\n","\n");
const blocks = [...guide.matchAll(/^```tsx?\n([\s\S]*?)^```/gm)];
const files = ['app/api/speeq/[[...speeq]]/route.ts','app/assistant.tsx','app/layout.tsx','app/page.tsx'];
if (blocks.length !== files.length) throw Error('Check guide file list');
for (const [i, file] of files.entries()) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,blocks[i][1]);
}
JS
pnpm install
pnpm exec tsc --noEmit
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import {createSpeeq} from "@speeq/server";
import {createMemoryStore} from "@speeq/store-memory";
import {FakeLLMProvider, startSession, assistantText} from "@speeq/testing";
const sdk = createSpeeq({agent:{name:"Test",instructions:"Greet."},store:createMemoryStore({quiet:true}),llm:new FakeLLMProvider([{text:"Hello."}])});
assert.equal(assistantText(await (await startSession(sdk.handler)).turn("hello")),"Hello.");
console.log("Packed SDK mock turn passed.");
JS
