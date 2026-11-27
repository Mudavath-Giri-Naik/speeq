// Runs after `changeset version`: keeps SPEEQ_PACKAGE_VERSION equal to the umbrella package version.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("packages/speeq/package.json", "utf8"));
const file = "packages/cli/src/version.ts";
const text = readFileSync(file, "utf8");
const next = text.replace(
  /export const SPEEQ_PACKAGE_VERSION = "[^"]+";/,
  `export const SPEEQ_PACKAGE_VERSION = "${version}";`,
);
if (next === text && !text.includes(`"${version}"`)) throw new Error("version constant not found");
writeFileSync(file, next);
console.log(`SPEEQ_PACKAGE_VERSION = ${version}`);
