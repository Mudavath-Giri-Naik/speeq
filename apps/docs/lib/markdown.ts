import type { Element, Root as HastRoot, Properties } from "hast";
import type { Blockquote, Code, Root as MdastRoot, Paragraph, PhrasingContent } from "mdast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface Heading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  /** Plain text of the document, used for search and llms-full.txt. */
  text: string;
}

const CALLOUTS = ["note", "tip", "warning", "important"] as const;
const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

/** Convert `npm i a b` style commands into the other package managers. */
export function convertInstall(command: string, pm: (typeof PACKAGE_MANAGERS)[number]): string {
  const match = /^npm (?:i|install) (.+)$/.exec(command.trim());
  if (!match) return command;
  const args = match[1] as string;
  if (pm === "npm") return `npm i ${args}`;
  if (pm === "pnpm") return `pnpm add ${args}`;
  if (pm === "yarn") return `yarn add ${args}`;
  return `bun add ${args}`;
}

function textOf(node: { children?: unknown[]; value?: string }): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => textOf(child as { value?: string })).join("");
}

/** `> **Note**` blockquotes become styled callouts. */
function remarkCallouts() {
  return (tree: MdastRoot) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== "paragraph") return;
      const lead = first.children[0];
      if (lead?.type !== "strong") return;
      const label = textOf(lead).trim().toLowerCase();
      if (!(CALLOUTS as readonly string[]).includes(label)) return;
      const rest: PhrasingContent[] = first.children.slice(1);
      const head = rest[0];
      if (head?.type === "text") head.value = head.value.replace(/^\s+/, "");
      const title: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: textOf(lead).trim() }],
        data: { hName: "p", hProperties: { className: ["callout-title"] } },
      };
      const body: Paragraph[] =
        rest.length > 0 && textOf({ children: rest }).trim()
          ? [{ type: "paragraph", children: rest }]
          : [];
      node.children = [title, ...body, ...node.children.slice(1)];
      node.data = {
        hName: "div",
        hProperties: { className: ["callout", `callout-${label}`], role: "note" },
      };
    });
  };
}

/** A ```bash pm block with `npm i ...` becomes four tabs (npm, pnpm, yarn, bun). */
function remarkPackageTabs() {
  return (tree: MdastRoot) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || index === undefined) return;
      if (!/\bpm\b/.test(node.meta ?? "")) return;
      const panes: Code[] = PACKAGE_MANAGERS.map((pm) => ({
        type: "code",
        lang: "bash",
        value: node.value
          .split("\n")
          .map((line) => convertInstall(line, pm))
          .join("\n"),
      }));
      parent.children[index] = {
        type: "blockquote",
        children: panes,
        data: { hName: "div", hProperties: { className: ["pm-tabs", "code-block"] } },
      } as Blockquote;
    });
  };
}

function prop(node: Element, name: string): unknown {
  return node.properties?.[name];
}

function classes(node: Element): string[] {
  const value = prop(node, "className");
  return Array.isArray(value) ? (value as string[]) : typeof value === "string" ? [value] : [];
}

function el(tag: string, properties: Properties, children: Element["children"] = []): Element {
  return { type: "element", tagName: tag, properties, children };
}

function copyButton(): Element {
  return el("button", { type: "button", className: ["copy-btn"], "data-copy": "" }, [
    { type: "text", value: "Copy" },
  ]);
}

/** Wrap every highlighted block in our own frame: header with title and a copy button. */
function rehypeCodeFrames() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName !== "figure" || prop(node, "data-rehype-pretty-code-figure") === undefined)
        return;
      const caption = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "figcaption",
      );
      const pre = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "pre",
      );
      if (!pre) return;
      const lang = String(prop(pre, "data-language") ?? "");
      const label = caption ? textOf(caption as never) : lang;
      const inTabs = parent.type === "element" && classes(parent as Element).includes("pm-tabs");
      const head = el("div", { className: ["code-head"] }, [
        el("span", { className: ["code-label"] }, [{ type: "text", value: label }]),
        copyButton(),
      ]);
      const frame = el(
        "div",
        inTabs ? { className: ["pm-pane"] } : { className: ["code-block"], "data-lang": lang },
        inTabs ? [pre] : [head, pre],
      );
      parent.children[index] = frame;
    });
  };
}

/** Mark pm panes with their manager and add the tab bar. */
function rehypePackageTabs() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "div" || !classes(node).includes("pm-tabs")) return;
      const panes = node.children.filter(
        (child): child is Element => child.type === "element" && classes(child).includes("pm-pane"),
      );
      panes.forEach((pane, i) => {
        const name = PACKAGE_MANAGERS[i] as string;
        pane.properties = { ...pane.properties, "data-pm": name };
        if (i > 0) pane.properties.hidden = true;
      });
      const tabsList = el(
        "div",
        { className: ["pm-bar"], role: "tablist", "aria-label": "Package manager" },
        PACKAGE_MANAGERS.map((name, i) =>
          el(
            "button",
            {
              type: "button",
              role: "tab",
              className: ["pm-tab"],
              "data-pm-tab": name,
              "aria-selected": i === 0 ? "true" : "false",
            },
            [{ type: "text", value: name }],
          ),
        ),
      );
      const bar = el("div", { className: ["code-head"] }, [tabsList, copyButton()]);
      node.children = [bar, ...panes];
    });
  };
}

/** Collect h2 and h3 headings after ids exist. */
function rehypeCollectHeadings(sink: Heading[]) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      const id = String(prop(node, "id") ?? "");
      if (!id) return;
      const text = node.children
        .filter(
          (child) => !(child.type === "element" && classes(child as Element).includes("anchor")),
        )
        .map((child) => textOf(child as never))
        .join("")
        .trim();
      sink.push({ depth: node.tagName === "h2" ? 2 : 3, id, text });
    });
  };
}

/** Render markdown to safe HTML. Raw HTML in the source is dropped, never rendered. */
export async function renderMarkdown(source: string): Promise<Rendered> {
  const headings: Heading[] = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCallouts)
    .use(remarkPackageTabs)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      test: ["h2", "h3"],
      properties: { className: ["anchor"], ariaLabel: "Link to this section" },
      content: { type: "text", value: "#" },
    })
    .use(rehypeCollectHeadings(headings))
    .use(rehypePrettyCode, {
      theme: { light: "github-light", dark: "github-dark-default" },
      keepBackground: false,
      defaultLang: "text",
    })
    .use(rehypeCodeFrames)
    .use(rehypePackageTabs)
    .use(rehypeStringify, { allowDangerousHtml: false })
    .process(source);
  return { html: String(file), headings, text: stripMarkdown(source) };
}

/** A rough plain-text version for search snippets. */
export function stripMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/[*_#|>~-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
