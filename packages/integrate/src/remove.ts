import type { ProjectFs } from "./fsx.js";
import { ownership } from "./owned.js";

/** Variables only speeq uses. Removed by default. */
export const SPEEQ_ONLY_NAMES = [
  "SPEEQ_SECRET",
  "SPEEQ_BASE_URL",
  "SPEEQ_LLM_MODEL",
  "SPEEQ_LLM_BASE_URL",
  "SPEEQ_LLM_API_KEY",
  "GROQ_STT_MODEL",
  "GEMINI_STT_MODEL",
] as const;
/** Provider keys your own app may also use. Kept unless chosen. */
export const SHARED_NAMES = [
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "SARVAM_API_KEY",
] as const;

/** One generated file that carries (or lost) speeq's marker. */
export interface RemovableFile {
  path: string;
  /** `owned`: untouched since generated. `edited`: marker kept, body changed. `taken`: marker deleted, the file is yours now. */
  state: "owned" | "edited" | "taken";
}
export interface RemovalPlan {
  files: RemovableFile[];
  /** Root layouts that import the chat box, with the text they would have without it. */
  layouts: { path: string; text: string }[];
  /** `speeq.config.ts`, when it exists. `header`: it still starts with the line speeq wrote. */
  config?: { path: string; header: boolean };
  /** The `.speeq` folder (decisions, manifest, generated files, backups) exists. */
  speeqDir: boolean;
  env: { file: string; speeq: string[]; shared: string[] }[];
}
/** What the developer chose to remove. */
export interface RemovalSelection {
  files: string[];
  layouts: string[];
  config: boolean;
  speeqDir: boolean;
  env: { file: string; names: string[] }[];
}

/** The layout text without the chat box import and element, or `undefined` when it has neither. */
export function unspliceLayout(source: string): string | undefined {
  let text = source;
  const importLine = /^import\s*\{\s*SpeeqAssistant\s*\}\s*from\s*["'][^"']+["'];?[ \t]*\r?\n/m;
  const ownLine = /^[ \t]*<SpeeqAssistant\s*\/>[ \t]*\r?\n/m;
  const inline = /<SpeeqAssistant\s*\/>/;
  text = text.replace(importLine, "");
  text = ownLine.test(text) ? text.replace(ownLine, "") : text.replace(inline, "");
  return text !== source && !text.includes("SpeeqAssistant") ? text : undefined;
}

/** True when every line that sets `name` gives it an empty value. */
function isEmptyValue(text: string, name: string): boolean {
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=(.*)$`);
  return text
    .split(/\r?\n/)
    .filter((l) => re.test(l))
    .every((l) => (re.exec(l)?.[1] ?? "").trim().replace(/^(?:""|'')$/, "") === "");
}
const LINE = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
/** Names (from `names`) that have a line in an env file. Values are not looked at. */
export function envNamesIn(text: string, names: readonly string[]): string[] {
  const lines = text.split(/\r?\n/);
  return names.filter((n) => lines.some((l) => LINE(n).test(l)));
}
/**
 * Remove the lines for `names` and the one-line comment speeq put above each, then the "Added by speeq"
 * header when nothing is left under it. Returns `""` when the file ends up empty. Other lines are untouched.
 */
export function stripEnvNames(text: string, names: readonly string[]): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const drop = new Set<number>();
  lines.forEach((l, i) => {
    if (!names.some((n) => LINE(n).test(l))) return;
    drop.add(i);
    if (/^\s*#/.test(lines[i - 1] ?? "") && !/Added by speeq/.test(lines[i - 1] ?? ""))
      drop.add(i - 1);
  });
  const kept = lines.filter((_, i) => !drop.has(i));
  const out: string[] = [];
  kept.forEach((l, i) => {
    if (/^#\s*Added by speeq/.test(l)) {
      const rest = kept.slice(i + 1).find((x) => x.trim() !== "");
      if (rest === undefined || /^#\s*Added by speeq/.test(rest)) return;
    }
    out.push(l);
  });
  while (out.length && out[out.length - 1]?.trim() === "") out.pop();
  while (out.length && out[0]?.trim() === "") out.shift();
  const squeezed = out.filter((l, i) => !(l.trim() === "" && out[i - 1]?.trim() === ""));
  return squeezed.length ? `${squeezed.join(nl)}${nl}` : "";
}

const ASSISTANTS = (p: string) => [
  `${p}components/speeq/assistant.tsx`,
  `${p}src/components/speeq/assistant.tsx`,
];
const HANDLERS = (p: string) =>
  ["app", "src/app"].flatMap((a) =>
    ["ts", "js"].map((e) => `${p}${a}/api/speeq/[[...speeq]]/route.${e}`),
  );
const LAYOUTS = (p: string) =>
  ["app", "src/app"].flatMap((a) => ["tsx", "jsx", "ts", "js"].map((e) => `${p}${a}/layout.${e}`));
const ENV_FILES = (p: string) => [`${p}.env.local`, `${p}.env.example`];

/** Find everything speeq added to a project. Reads files; changes nothing. */
export async function planRemoval(fs: ProjectFs, prefix: string): Promise<RemovalPlan> {
  const files: RemovableFile[] = [];
  for (const path of [...ASSISTANTS(prefix), ...HANDLERS(prefix)]) {
    const text = await fs.read(path);
    if (text === undefined) continue;
    const s = ownership(text);
    files.push({ path, state: s === "owned" ? "owned" : s === "edited" ? "edited" : "taken" });
  }
  const layouts: RemovalPlan["layouts"] = [];
  for (const path of LAYOUTS(prefix)) {
    const text = await fs.read(path);
    const next = text === undefined ? undefined : unspliceLayout(text);
    if (text !== undefined && next !== undefined) layouts.push({ path, text: next });
  }
  const configPath = `${prefix}speeq.config.ts`;
  const config = await fs.read(configPath);
  const env: RemovalPlan["env"] = [];
  for (const file of ENV_FILES(prefix)) {
    const text = await fs.read(file);
    if (text === undefined) continue;
    let speeq = envNamesIn(text, SPEEQ_ONLY_NAMES);
    let shared = envNamesIn(text, SHARED_NAMES);
    if (file.endsWith(".env.example")) {
      // The example file holds placeholders, not secrets: empty provider names there were speeq's.
      const empty = shared.filter((n) => isEmptyValue(text, n));
      speeq = [...speeq, ...empty];
      shared = shared.filter((n) => !empty.includes(n));
    }
    if (speeq.length || shared.length) env.push({ file, speeq, shared });
  }
  return {
    files,
    layouts,
    ...(config === undefined
      ? {}
      : { config: { path: configPath, header: config.startsWith("// Created by `speeq init`") } }),
    speeqDir: (await fs.list(`${prefix}.speeq`)).length > 0,
    env,
  };
}

/** Do what was chosen. Returns the paths changed or removed. */
export async function applyRemoval(
  fs: ProjectFs,
  prefix: string,
  plan: RemovalPlan,
  pick: RemovalSelection,
): Promise<string[]> {
  const done: string[] = [];
  for (const l of plan.layouts) {
    if (!pick.layouts.includes(l.path)) continue;
    await fs.write(l.path, l.text);
    done.push(l.path);
  }
  for (const f of plan.files) {
    if (!pick.files.includes(f.path)) continue;
    await fs.remove(f.path);
    done.push(f.path);
  }
  for (const e of pick.env) {
    const text = await fs.read(e.file);
    if (text === undefined || e.names.length === 0) continue;
    const next = stripEnvNames(text, e.names);
    if (next === "") await fs.remove(e.file);
    else await fs.write(e.file, next);
    done.push(e.file);
  }
  if (pick.config && plan.config) {
    await fs.remove(plan.config.path);
    done.push(plan.config.path);
  }
  if (pick.speeqDir && plan.speeqDir) {
    await fs.removeTree(`${prefix}.speeq`);
    done.push(`${prefix}.speeq/`);
  }
  return done;
}
