import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/*
 * The release workflow fails on a changeset whose frontmatter does not parse. A Markdown formatter
 * once rewrote `"pkg": patch` + `---` into a heading, so check every changeset here, before CI.
 */
const dir = join(import.meta.dirname, "..", ".changeset");
const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
const packages = new Set<string>();
for (const parent of ["packages", "packages/adapters"])
  for (const d of readdirSync(join(import.meta.dirname, "..", parent), { withFileTypes: true }))
    if (d.isDirectory())
      try {
        packages.add(
          JSON.parse(
            readFileSync(join(import.meta.dirname, "..", parent, d.name, "package.json"), "utf8"),
          ).name,
        );
      } catch {
        // not a package
      }

it.each(files.length ? files : ["(none)"])("changeset %s has valid frontmatter", (file) => {
  if (file === "(none)") return;
  const text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n((?:"[^"\n]+": (?:major|minor|patch)\n)+)---\n\n\S/.exec(text);
  expect(
    m,
    `${file} must start with ---, one "package": bump per line, ---, a blank line and a summary`,
  ).not.toBeNull();
  for (const line of (m?.[1] ?? "").trim().split("\n")) {
    const name = /^"([^"]+)"/.exec(line)?.[1] ?? "";
    expect(packages.has(name), `${file}: unknown package ${name}`).toBe(true);
  }
});
