import { describe, expect, it } from "vitest";
import { convertInstall, renderMarkdown, stripMarkdown } from "../lib/markdown";

describe("markdown pipeline", () => {
  it("adds heading ids and collects h2/h3 headings", async () => {
    const out = await renderMarkdown("# Title\n\n## First step\n\n### Detail\n");
    expect(out.html).toContain('id="first-step"');
    expect(out.headings).toEqual([
      { depth: 2, id: "first-step", text: "First step" },
      { depth: 3, id: "detail", text: "Detail" },
    ]);
  });

  it("autolinks h2 and h3 but not the title", async () => {
    const out = await renderMarkdown("# Title\n\n## Section\n");
    expect(out.html).toMatch(/<h2[^>]*>Section<a[^>]*class="anchor"/);
    expect(out.html).not.toMatch(/<h1[^>]*>.*anchor/);
  });

  it("renders callouts", async () => {
    const out = await renderMarkdown("> **Warning** Be careful.\n");
    expect(out.html).toContain("callout-warning");
    expect(out.html).toContain("callout-title");
    expect(out.html).toContain("Be careful.");
  });

  it("leaves an ordinary blockquote alone", async () => {
    const out = await renderMarkdown("> just a quote\n");
    expect(out.html).not.toContain("callout");
    expect(out.html).toContain("<blockquote>");
  });

  it("frames code with a title and a copy button", async () => {
    const out = await renderMarkdown('```ts title="app/route.ts"\nconst a = 1;\n```\n');
    expect(out.html).toContain("code-block");
    expect(out.html).toContain("app/route.ts");
    expect(out.html).toContain("data-copy");
    expect(out.html).toContain("--shiki-dark");
  });

  it("turns a pm block into four package manager tabs", async () => {
    const out = await renderMarkdown("```bash pm\nnpm i speeq@next zod\n```\n");
    expect(out.html).toContain("pm-tabs");
    for (const name of ["npm", "pnpm", "yarn", "bun"]) {
      expect(out.html).toContain(`data-pm-tab="${name}"`);
    }
    expect(out.html).toContain("pnpm</span><span");
    expect(out.html).toContain("add");
    expect(out.html).not.toContain("<mark");
  });

  it("converts install commands", () => {
    expect(convertInstall("npm i a b", "pnpm")).toBe("pnpm add a b");
    expect(convertInstall("npm i a", "yarn")).toBe("yarn add a");
    expect(convertInstall("npm i a", "bun")).toBe("bun add a");
    expect(convertInstall("npm install a", "npm")).toBe("npm i a");
    expect(convertInstall("echo hi", "pnpm")).toBe("echo hi");
  });

  it("renders tables", async () => {
    const out = await renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(out.html).toContain("<table>");
  });

  it("does NOT render raw HTML from markdown", async () => {
    const out = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\nok',
    );
    expect(out.html).not.toContain("<script");
    expect(out.html).not.toContain("onerror");
    expect(out.html).toContain("ok");
  });

  it("strips markdown for search text", () => {
    expect(
      stripMarkdown("## Hi\n\nSee [the docs](/docs/x) and `code`.\n\n```ts\nhidden()\n```"),
    ).toBe("Hi See the docs and code.");
  });
});
