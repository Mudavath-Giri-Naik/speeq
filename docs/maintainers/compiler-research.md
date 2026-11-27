# Compiler research measurements

All commands ran on 2026-11-27 in PowerShell. Node reported v24.15.0, Windows
10.0.26300, Intel Core i5-11320H at 3.20 GHz and 8,316,030,976 bytes of RAM.
The benchmark ran in a new temporary directory outside the checkout.
`SPEEQ_TS` was the absolute path of the workspace's `node_modules/typescript`.

## Syntactic parse

One process wrote 1,000 TSX files of 150 lines each before starting the timer.
Reading and parsing all files took 1,809.50 ms. Peak process RSS was 136,212 KiB
and includes startup and input generation. All files had zero parse diagnostics.
Command body passed to `node -e` (line breaks added for readability):

```js
const ts = require(process.env.SPEEQ_TS),
  fs = require("node:fs"),
  os = require("node:os");
for (let i = 0; i < 1000; i++)
  fs.writeFileSync(
    i + ".tsx",
    Array.from(
      { length: 150 },
      (_, j) => "export const C" + j + " = () => <div>" + i + "</div>",
    ).join("\n"),
  );
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  const f = ts.createSourceFile(
    i + ".tsx",
    fs.readFileSync(i + ".tsx", "utf8"),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  if (f.parseDiagnostics.length) throw Error("syntax");
}
console.log(
  performance.now() - start,
  process.resourceUsage().maxRSS,
  os.cpus()[0].model,
  os.totalmem(),
  os.release(),
  process.version,
);
```

## ts-morph compatibility

`npm install --ignore-scripts --no-audit --no-fund ts-morph typescript@6.0.3`
installed 12 packages successfully with no peer warnings. This probe ran via `node -e`:

```js
const { Project, ts } = require("ts-morph"),
  repo = require(process.env.SPEEQ_TS);
const f = new Project({ useInMemoryFileSystem: true }).createSourceFile(
  "a.tsx",
  "const A = <div/>",
);
console.log(
  require("ts-morph/package.json").version,
  ts.version,
  repo.version,
  f.compilerNode.parseDiagnostics.length,
  repo.isSourceFile(f.compilerNode),
  ts === repo,
);
```

Output was `28.0.0 6.0.2 6.0.3 0 true false`. The wrapper parsed TSX and the
workspace compiler recognized its SourceFile. This narrows ADR-0013's compatibility
concern for this case. The wrapper used a distinct TS instance and patch version.
Full interoperability and release lag remain unverified.

## Registry measurements

For each package below, ran `npm pack <package> --dry-run --json` and read
`unpackedSize`, then `npm view <name>@<resolved-version> license`.

| Package argument | Resolved | Licence    | Unpacked bytes |
| ---------------- | -------- | ---------- | -------------: |
| typescript@6.0.3 | 6.0.3    | Apache-2.0 |     24,346,827 |
| ignore@7.0.17    | 7.0.17   | MIT        |        133,999 |
| @clack/prompts   | 1.9.0    | MIT        |         94,642 |
| picocolors       | 1.1.1    | ISC        |          6,373 |

## Alternatives

`npm view tree-sitter version description dependencies --json` returned 0.25.1.
Registry documentation describes Node bindings. The declared dependencies include
node-addon-api and node-gyp-build. WASM behavior and module resolution are unverified.

`npm view @babel/parser version description dependencies --json` returned 8.1.3.
Registry documentation describes a JavaScript parser and lists @babel/types as a
dependency. TSX parsing performance and module resolution are unverified.

`npm view recast version description dependencies --json` returned 0.24.3.
Registry documentation describes a nondestructive pretty-printer and source-map
generator. The dependencies include esprima and ast-types. Formatting preservation
on host code is unverified. No alternative parser was added to the workspace.
