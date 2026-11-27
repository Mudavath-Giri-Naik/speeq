// Writes the clean app's package.json with the local tarballs and overrides for every workspace package.
import fs from "node:fs";
import path from "node:path";

const [root, version] = process.argv.slice(2);
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const demo = read("apps/demo/package.json");
const top = read("package.json");
const libs = { ...top.devDependencies, ...demo.dependencies, ...demo.devDependencies };
const pick = (names) => Object.fromEntries(names.map((n) => [n, libs[n]]));
const overrides = {};
for (const parent of ["packages", "packages/adapters"]) {
  for (const dir of fs.readdirSync(path.join(root, parent))) {
    const file = path.join(parent, dir, "package.json");
    if (!fs.existsSync(path.join(root, file))) continue;
    const pkg = read(file);
    if (pkg.private) continue;
    overrides[pkg.name] =
      `file:./packs/${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
  }
}
const app = {
  name: "clean-next-app",
  private: true,
  scripts: { typecheck: "tsc --noEmit" },
  dependencies: {
    ...pick(["next", "react", "react-dom", "zod"]),
    speeq: overrides.speeq ?? `file:./packs/speeq-${version}.tgz`,
  },
  devDependencies: pick(["typescript", "@types/node", "@types/react", "@types/react-dom"]),
  overrides,
};
fs.writeFileSync("package.json", `${JSON.stringify(app, null, 2)}\n`);
fs.writeFileSync(".npmrc", "legacy-peer-deps=true\naudit=false\nfund=false\n");
