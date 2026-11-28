import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthCandidate, DataSourceCandidate } from "@speeq/compiler";
import {
  type AgentChoices,
  contextSpec,
  guessPreset,
  PRESETS,
  presetById,
  renderIdentity,
  type SourceChoice,
  settingsPaths,
} from "@speeq/integrate";
import pc from "picocolors";
import { uiOf } from "../ui.js";
import { runStep } from "../wizard.js";
import { checkMongo } from "./mongo.js";
import { type ControlState, candidates, envValue } from "./state.js";

const BACK = "__done";
type Field = { id: string; label: string; value: () => string; edit: () => Promise<void> };

/** A section's own menu: each line shows its current value; pick one to change it. */
async function menu(
  st: ControlState,
  title: string,
  fields: Field[],
  help: string,
  intro?: () => string,
) {
  const prompts = st.ctx.env.prompts;
  const ui = uiOf(st.ctx);
  if (!prompts) return;
  for (;;) {
    if (intro) ui.note(intro(), title);
    const choice = await prompts.select(title, [
      ...fields.map((f) => ({ value: f.id, label: f.label, hint: clip(f.value(), 44) })),
      { value: "?", label: "? Help", hint: "what this section does" },
      { value: BACK, label: "← Back to home", hint: "" },
    ]);
    if (choice === BACK) return;
    if (choice === "?") {
      ui.note(help, `${title} · help`);
      continue;
    }
    await fields.find((f) => f.id === choice)?.edit();
  }
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (v: string | undefined) => v ?? pc.dim("not set");
const list = (v: string[] | undefined, sep = ", ") => (v?.length ? v.join(sep) : pc.dim("none"));

/** Text field: Enter keeps the value, `-` clears it. */
async function editText(
  st: ControlState,
  label: string,
  current: string | undefined,
  set: (v: string | undefined) => void,
  max = 400,
) {
  const v = (
    await st.ctx.env.prompts?.text(`${label} (Enter keeps it, - clears it)`, current ?? "")
  )?.trim();
  if (v === undefined) return;
  if (v === "-") set(undefined);
  else if (v) set(v.slice(0, max));
}
async function editList(
  st: ControlState,
  label: string,
  current: string[] | undefined,
  set: (v: string[] | undefined) => void,
  sep = ",",
) {
  const shown = sep === "," ? ", " : ` ${sep} `;
  const v = (
    await st.ctx.env.prompts?.text(
      `${label} (separate with "${sep}", - clears)`,
      (current ?? []).join(shown),
    )
  )?.trim();
  if (v === undefined || v === "") return;
  if (v === "-") return set(undefined);
  set(
    v
      .split(sep)
      .map((x) => x.trim())
      .filter(Boolean),
  );
}
async function editNumber(
  st: ControlState,
  label: string,
  current: number | undefined,
  lo: number,
  hi: number,
  set: (v: number | undefined) => void,
) {
  const v = (
    await st.ctx.env.prompts?.text(
      `${label} (${lo} to ${hi}, - for the default)`,
      current === undefined ? "" : String(current),
    )
  )?.trim();
  if (!v) return;
  if (v === "-") return set(undefined);
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi)
    return uiOf(st.ctx).warn(`Use a number from ${lo} to ${hi}.`);
  set(n);
}
async function pick<T extends string>(
  st: ControlState,
  label: string,
  options: { value: T; label: string; hint?: string }[],
  current: T | undefined,
): Promise<T | undefined> {
  const prompts = st.ctx.env.prompts;
  if (!prompts) return undefined;
  const v = await prompts.select(
    label,
    [...options, { value: BACK as T, label: "← Back", hint: "" }],
    current,
  );
  return v === BACK ? undefined : v;
}

// ---------------------------------------------------------------- 01 Agent identity and personality

/** Applies a preset: fills tone, instructions, greetings and starter suggestions. Never enables data. */
export function applyPreset(d: AgentChoices, id: string) {
  const p = presetById(id);
  if (!p) return;
  d.preset = p.id;
  d.agent = {
    ...d.agent,
    style: { ...d.agent?.style, personality: p.personality, responseLength: p.responseLength },
  };
  if (!d.agent.instructions) d.agent.instructions = p.instructions;
  d.business = {
    ...d.business,
    industry: d.business?.industry ?? p.industry,
    ...(p.sensitive ? { sensitive: true } : {}),
  };
  d.greeting = {
    ...d.greeting,
    guest: d.greeting?.guest ?? p.greeting.guest,
    member: d.greeting?.member ?? p.greeting.member,
    returning: d.greeting?.returning ?? p.greeting.returning,
  };
  if (!d.starters?.length)
    d.starters = p.starters.map((s) => ({
      label: s.label,
      ...(s.auth || s.requires
        ? {
            when: {
              ...(s.auth ? { auth: s.auth } : {}),
              ...(s.requires ? { requires: s.requires } : {}),
            },
          }
        : {}),
    }));
}

async function editInstructions(st: ControlState) {
  const prompts = st.ctx.env.prompts;
  if (!prompts) return;
  const d = st.draft;
  const how = await pick(
    st,
    "Custom instructions",
    [
      { value: "type", label: "Type them here", hint: "one line; write \\n for a new line" },
      {
        value: "editor",
        label: "Open in your editor",
        hint: "multi-line, saved when you close it",
      },
      { value: "clear", label: "Use the default", hint: "" },
    ],
    "type",
  );
  if (!how) return;
  if (how === "clear") {
    if (d.agent) delete d.agent.instructions;
    return;
  }
  if (how === "type") {
    const v = (
      await prompts.text(
        "Instructions (Enter keeps them)",
        (d.agent?.instructions ?? "").replace(/\n/g, "\\n"),
      )
    ).trim();
    if (v) d.agent = { ...d.agent, instructions: v.replace(/\\n/g, "\n").slice(0, 4000) };
    return;
  }
  const exec = st.ctx.env.exec;
  if (!exec)
    return uiOf(st.ctx).warn("No editor can be started from here. Type the instructions instead.");
  const file = join(tmpdir(), `speeq-instructions-${process.pid}.md`);
  await writeFile(file, d.agent?.instructions ?? "Write what the assistant should do and avoid.\n");
  const env = st.ctx.env.env;
  const editor = env.VISUAL || env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
  const [cmd = "nano", ...args] = editor.split(/\s+/);
  try {
    await exec(cmd, [...args, file], st.root);
    const text = (await readFile(file, "utf8")).trim();
    if (text) d.agent = { ...d.agent, instructions: text.slice(0, 4000) };
    uiOf(st.ctx).ok(`Instructions updated (${text.split("\n").length} lines)`);
  } finally {
    await rm(file, { force: true });
  }
}

export async function agentSection(st: ControlState) {
  const d = st.draft;
  const style = () => d.agent?.style ?? {};
  const setStyle = (k: string, v: string | undefined) => {
    const s: Record<string, string> = { ...style() };
    if (v) s[k] = v;
    else delete s[k];
    d.agent = { ...d.agent, style: s };
  };
  const routes =
    st.loaded?.manifest.capabilities.flatMap((c) => (c.kind === "route" ? [c.path] : [])) ?? [];
  const caps =
    st.loaded?.manifest.capabilities.flatMap((c) => (c.kind !== "route" ? [c.title] : [])) ?? [];
  const guess = guessPreset(routes, caps);
  await menu(
    st,
    "01 Agent identity and personality",
    [
      {
        id: "name",
        label: "Name",
        value: () => st.name,
        edit: () =>
          editText(st, "Assistant name", st.name, (v) => (st.name = v ?? "Assistant"), 40),
      },
      {
        id: "preset",
        label: "Preset",
        value: () =>
          d.preset
            ? (presetById(d.preset)?.label ?? d.preset)
            : `suggested: ${presetById(guess.id)?.label}`,
        edit: async () => {
          if (guess.because.length)
            uiOf(st.ctx).info(
              pc.dim(
                `Suggested ${presetById(guess.id)?.label} because of ${guess.because.join(", ")}.`,
              ),
            );
          const id = await pick(
            st,
            "Which kind of assistant?",
            PRESETS.map((p) => ({
              value: p.id,
              label: p.label,
              hint: `${p.hint}${p.id === guess.id ? " · suggested" : ""}`,
            })),
            (d.preset ?? guess.id) as never,
          );
          if (id) {
            applyPreset(d, id);
            uiOf(st.ctx).ok(
              `${presetById(id)?.label}: tone, greetings and starter ideas filled in. Nothing else was turned on.`,
            );
          }
        },
      },
      {
        id: "description",
        label: "What it is for",
        value: () => show(d.agent?.description),
        edit: () =>
          editText(
            st,
            "One or two sentences",
            d.agent?.description,
            (v) => (d.agent = { ...d.agent, description: v }),
          ),
      },
      {
        id: "personality",
        label: "Personality",
        value: () => style().personality ?? "default (warm)",
        edit: async () =>
          setStyle(
            "personality",
            await pick(
              st,
              "Personality",
              [
                "professional",
                "friendly",
                "conversational",
                "educational",
                "concise",
                "formal",
              ].map((v) => ({ value: v, label: v })),
              style().personality,
            ),
          ),
      },
      {
        id: "length",
        label: "Response length",
        value: () => style().responseLength ?? "short",
        edit: async () =>
          setStyle(
            "responseLength",
            await pick(
              st,
              "Response length",
              [
                { value: "short", label: "short", hint: "one to three sentences" },
                { value: "medium", label: "medium" },
                { value: "detailed", label: "detailed", hint: "full explanations when asked" },
              ],
              style().responseLength,
            ),
          ),
      },
      {
        id: "depth",
        label: "Explanation depth",
        value: () => style().explanationDepth ?? "standard",
        edit: async () =>
          setStyle(
            "explanationDepth",
            await pick(
              st,
              "Explanation depth",
              ["simple", "standard", "expert"].map((v) => ({ value: v, label: v })),
              style().explanationDepth,
            ),
          ),
      },
      {
        id: "names",
        label: "Use the customer's name",
        value: () => style().nameUsage ?? "rarely",
        edit: async () =>
          setStyle(
            "nameUsage",
            await pick(
              st,
              "Name usage",
              [
                { value: "rarely", label: "rarely" },
                { value: "greeting-only", label: "in the greeting only" },
                { value: "never", label: "never" },
              ],
              style().nameUsage,
            ),
          ),
      },
      {
        id: "followups",
        label: "Follow-up suggestions",
        value: () => style().followUps ?? "suggest",
        edit: async () =>
          setStyle(
            "followUps",
            await pick(
              st,
              "Follow-ups",
              [
                { value: "suggest", label: "suggest one next step" },
                { value: "none", label: "none" },
              ],
              style().followUps,
            ),
          ),
      },
      {
        id: "instructions",
        label: "Custom instructions",
        value: () =>
          d.agent?.instructions ? `${d.agent.instructions.split("\n").length} line(s)` : "default",
        edit: () => editInstructions(st),
      },
    ],
    "Name, purpose and tone. Every option maps to fixed prompt lines. Safety rules, validation and confirmations are always added by speeq and cannot be turned off here.",
  );
}

// ---------------------------------------------------------------- 02 Business information

export async function businessSection(st: ControlState) {
  const d = st.draft;
  const facts = st.found?.business;
  const b = () => d.business ?? {};
  const set = (k: keyof NonNullable<AgentChoices["business"]>, v: unknown) => {
    const next: Record<string, unknown> = { ...b() };
    if (v === undefined) delete next[k];
    else next[k] = v;
    d.business = next as AgentChoices["business"];
  };
  const evidence = () => {
    const lines: string[] = [];
    if (facts?.name)
      lines.push(
        `Name         ${facts.name.value}  ${pc.dim(`from ${facts.name.evidence.file}:${facts.name.evidence.line}`)}`,
      );
    if (facts?.description)
      lines.push(
        `Description  ${clip(facts.description.value, 60)}  ${pc.dim(`from ${facts.description.evidence.file}:${facts.description.evidence.line}`)}`,
      );
    if (facts?.pages.length)
      lines.push(
        `Pages        ${facts.pages
          .slice(0, 6)
          .map((p) => p.title)
          .join(", ")}`,
      );
    if (!lines.length) lines.push("speeq found nothing reliable about the business in the code.");
    if (facts?.needsDescription)
      lines.push(pc.yellow("! Add one sentence about what the business does."));
    return lines.join("\n");
  };
  await menu(
    st,
    "02 Business information",
    [
      {
        id: "found",
        label: "Use what speeq found",
        value: () =>
          facts?.name || facts?.description ? "fills empty fields only" : "nothing found",
        edit: async () => {
          if (facts?.name && !b().name) set("name", facts.name.value);
          if (facts?.description && !b().description) set("description", facts.description.value);
          if (facts?.pages.length && !b().offerings)
            set(
              "offerings",
              facts.pages.slice(0, 6).map((p) => p.title),
            );
          uiOf(st.ctx).ok("Filled the empty fields. Review them below.");
        },
      },
      {
        id: "name",
        label: "Business name",
        value: () => show(b().name),
        edit: () => editText(st, "Business name", b().name, (v) => set("name", v), 80),
      },
      {
        id: "description",
        label: "What it does",
        value: () => show(b().description),
        edit: () =>
          editText(st, "What the business does, in one sentence", b().description, (v) =>
            set("description", v),
          ),
      },
      {
        id: "industry",
        label: "Industry",
        value: () => show(b().industry),
        edit: () => editText(st, "Industry", b().industry, (v) => set("industry", v), 60),
      },
      {
        id: "audience",
        label: "Audience",
        value: () => show(b().audience),
        edit: () => editText(st, "Who it is for", b().audience, (v) => set("audience", v), 160),
      },
      {
        id: "offerings",
        label: "Products or services",
        value: () => list(b().offerings),
        edit: () => editList(st, "Products or services", b().offerings, (v) => set("offerings", v)),
      },
      {
        id: "terms",
        label: "Terms people use",
        value: () => list(b().terminology),
        edit: () =>
          editList(st, "Words customers use (PYQ, mock test)", b().terminology, (v) =>
            set("terminology", v),
          ),
      },
      {
        id: "support",
        label: "Human support",
        value: () => show(b().support),
        edit: () =>
          editText(st, "Where people get human help", b().support, (v) => set("support", v), 160),
      },
      {
        id: "policies",
        label: "Policies",
        value: () => show(b().policies),
        edit: () =>
          editText(st, "Short policy notes (refunds, delivery)", b().policies, (v) =>
            set("policies", v),
          ),
      },
      {
        id: "sensitive",
        label: "Sensitive domain",
        value: () => (b().sensitive ? "yes: never volunteer private details" : "no"),
        edit: async () =>
          set(
            "sensitive",
            (await st.ctx.env.prompts?.confirm(
              "Healthcare, finance or similar? (stricter: no account data in greetings)",
              b().sensitive === true,
            ))
              ? true
              : undefined,
          ),
      },
    ],
    "What the business is, so the agent talks like it works there. This is trusted text you write; speeq only suggests values it found in your layout metadata, package.json and README.",
    evidence,
  );
}

// ---------------------------------------------------------------- 03 Model and 04 Voice

export async function modelSection(st: ControlState) {
  const d = st.draft;
  const a = () => d.agent ?? {};
  await menu(
    st,
    "03 Model provider and behavior",
    [
      {
        id: "provider",
        label: "Provider and model",
        value: () => `${st.c.provider}${st.c.model ? ` · ${st.c.model}` : ""}`,
        edit: async () => void (await runStep(st.ctx, st.io, st.c, "model", true)),
      },
      {
        id: "temperature",
        label: "Temperature",
        value: () => (a().temperature === undefined ? "provider default" : String(a().temperature)),
        edit: () =>
          editNumber(
            st,
            "Temperature",
            a().temperature,
            0,
            2,
            (v) => (d.agent = { ...a(), temperature: v }),
          ),
      },
      {
        id: "steps",
        label: "Max steps per message",
        value: () => String(a().maxSteps ?? 5),
        edit: () =>
          editNumber(
            st,
            "Model calls per message (tool round trips)",
            a().maxSteps,
            1,
            12,
            (v) => (d.agent = { ...a(), maxSteps: v }),
          ),
      },
      {
        id: "history",
        label: "History sent to the model",
        value: () => `${a().historyTurns ?? 8} turns`,
        edit: () =>
          editNumber(
            st,
            "Previous user turns sent to the model",
            a().historyTurns,
            0,
            50,
            (v) => (d.agent = { ...a(), historyTurns: v }),
          ),
      },
    ],
    "The provider is tested before it is used: keys are checked at once and models get one tiny test message. Your previous provider stays until you save. Customer data never goes to a provider you did not choose.",
  );
}

export async function voiceSection(st: ControlState) {
  await menu(
    st,
    "04 Voice and languages",
    [
      {
        id: "how",
        label: "How people talk",
        value: () => st.c.voice,
        edit: async () => void (await runStep(st.ctx, st.io, st.c, "voice", true)),
      },
      {
        id: "languages",
        label: "Languages",
        value: () => st.c.languages.join(", "),
        edit: async () => void (await runStep(st.ctx, st.io, st.c, "languages", true)),
      },
    ],
    "Voice and text share the same agent, identity, memory and permissions. Paid speech (Sarvam) is used only when you choose it.",
  );
}

// ---------------------------------------------------------------- 05 Authentication and identity

const LEVEL: Record<string, string> = {
  "implementation-detected": `${pc.green("✓")} found, can be bound`,
  "provider-detected": `${pc.yellow("!")} package only`,
  "requires-review": `${pc.yellow("!")} requires review`,
  unsupported: `${pc.red("✕")} unsupported`,
};
function authTable(st: ControlState): string {
  const found = st.found?.auth;
  if (!found?.candidates.length)
    return "No sign-in system was found. Everyone is treated as a guest, which is fine for public sites.\nIf you have your own sign-in, return { id } from your session in resolveUser (speeq.config.ts).";
  const bound = st.draft.identity?.binding;
  return found.candidates
    .map((c) => {
      const where = c.evidence[0] ? pc.dim(`${c.evidence[0].file}:${c.evidence[0].line}`) : "";
      const isBound = bound && c.entry && JSON.stringify(c.entry) === JSON.stringify(bound);
      return [
        `${isBound ? pc.green("● bound") : "  "} ${c.label}  ${LEVEL[c.level] ?? c.level}  ${where}`,
        ...c.notes.map((n) => `    ${pc.dim(n)}`),
      ].join("\n");
    })
    .join("\n");
}
export async function authSection(st: ControlState) {
  const d = st.draft;
  const ready = (st.found?.auth.candidates ?? []).filter(
    (c): c is AuthCandidate & { entry: NonNullable<AuthCandidate["entry"]> } => !!c.entry,
  );
  const fields: Field[] = ready.map((c) => ({
    id: `bind:${c.provider}`,
    label: `Bind ${c.label}`,
    value: () =>
      d.identity?.binding && JSON.stringify(d.identity.binding) === JSON.stringify(c.entry)
        ? "bound"
        : "generates resolveUser",
    edit: async () => {
      d.identity = { ...d.identity, binding: c.entry, provider: c.label };
      uiOf(st.ctx).ok(
        `${c.label} will be bound on save. The browser can never say who it is; your session decides.`,
      );
    },
  }));
  fields.push(
    {
      id: "expose",
      label: "What the agent may know",
      value: () => list(d.identity?.expose),
      edit: async () => {
        const v = await st.ctx.env.prompts?.multiselect(
          "Profile fields the agent may use (ids and emails are never shared)",
          [
            { value: "displayName", label: "Display name" },
            { value: "preferredName", label: "Preferred name" },
            { value: "locale", label: "Preferred language" },
          ],
          d.identity?.expose ?? [],
        );
        if (v)
          d.identity = {
            ...d.identity,
            expose: v as ("displayName" | "preferredName" | "locale")[],
          };
      },
    },
    {
      id: "preview",
      label: "Preview the generated code",
      value: () => (d.identity?.binding ? "resolveUser" : "bind first"),
      edit: async () => {
        const b = d.identity?.binding;
        if (!b) return uiOf(st.ctx).warn("Bind a sign-in system first.");
        const path = settingsPaths(st.io.prefix).identity;
        const profile = (d.identity?.expose ?? []).some((f) => f !== "locale");
        uiOf(st.ctx).note(
          renderIdentity(b, path, { profile }).split("\n").slice(1).join("\n"),
          path,
        );
      },
    },
  );
  if (d.identity?.binding)
    fields.push({
      id: "unbind",
      label: "Stop using sign-in",
      value: () => "everyone becomes a guest",
      edit: async () => {
        if (d.identity) delete d.identity.binding;
        uiOf(st.ctx).ok("resolveUser will be removed on save.");
      },
    });
  await menu(
    st,
    "05 Authentication and identity",
    fields,
    "speeq reuses your app's sign-in on the server for every request. It never trusts the browser, never changes your login code, and only shares the profile fields you tick.",
    () => authTable(st),
  );
}

// ---------------------------------------------------------------- 06 Customer context and permissions

function sourceLine(st: ControlState, c: DataSourceCandidate): string {
  const on = st.draft.context?.sources?.find((s) => s.path === c.path);
  const state = on
    ? pc.green("✓ approved")
    : c.binding === "bindable"
      ? "○ off"
      : pc.yellow("! requires binding");
  return `${state}  ${c.id}  ${pc.dim(c.path)}  ${c.category}`;
}
function sourceDetail(st: ControlState, c: DataSourceCandidate): string {
  const on = st.draft.context?.sources?.find((s) => s.path === c.path);
  const fields = c.fields.length
    ? c.fields
        .map((f) =>
          f.sensitive
            ? `  ${pc.red("✕")} ${f.name}  restricted`
            : `  ${on?.fields.includes(f.name) ? pc.green("[x]") : "[ ]"} ${f.name}`,
        )
        .join("\n")
    : "  (not found in the code: type the field names)";
  return [
    `Source          ${c.location.file}:${c.location.line}`,
    `Endpoint        GET ${c.path}`,
    `Sign-in check   ${c.authEvidence === "helper-called" ? "auth helper called" : pc.yellow(c.authEvidence === "unknown" ? "unknown" : "none found")}`,
    `Customer scope  ${c.customerScope === "user-referenced" ? "mentions the session user" : pc.yellow("not visible")}  ${pc.dim("(evidence, not proof)")}`,
    `Loading         ${on?.load ?? "on demand"}`,
    `Status          ${on ? "approved, bound on save" : c.binding === "bindable" ? "off" : "needs hand-written code"}`,
    "Fields",
    fields,
  ].join("\n");
}
async function editSource(st: ControlState, c: DataSourceCandidate) {
  const d = st.draft;
  const prompts = st.ctx.env.prompts;
  const ui = uiOf(st.ctx);
  if (!prompts) return;
  const current = () => d.context?.sources?.find((s) => s.path === c.path);
  const put = (s: SourceChoice | undefined) => {
    const others = (d.context?.sources ?? []).filter((x) => x.path !== c.path);
    d.context = { ...d.context, sources: s ? [...others, s] : others };
  };
  if (c.binding !== "bindable") {
    ui.note(
      `${c.path} needs ${c.requiredInputs.join(", ")}, which only your code can supply.\nWrite a defineContext({ ... }) for it in speeq.config.ts (see docs/guides/customer-context.md).`,
      c.id,
    );
    return;
  }
  await menu(
    st,
    `Context source: ${c.id}`,
    [
      {
        id: "fields",
        label: current() ? "Approved fields" : "Approve fields (turns it on)",
        value: () => list(current()?.fields),
        edit: async () => {
          let fields: string[];
          if (c.fields.length) {
            const safe = c.fields.filter((f) => !f.sensitive);
            if (!safe.length)
              return ui.warn(
                "Every field of this response looks sensitive. Nothing can be approved.",
              );
            fields = await prompts.multiselect(
              "Fields the agent may see",
              safe.map((f) => ({ value: f.name, label: f.name })),
              current()?.fields ?? [],
            );
          } else {
            const v = (
              await prompts.text(
                "Field names, comma separated (e.g. items, count)",
                (current()?.fields ?? []).join(", "),
              )
            ).trim();
            fields = v
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
          }
          if (!fields.length) return put(undefined);
          let authReviewed = current()?.authReviewed;
          if (c.authEvidence !== "helper-called" && !authReviewed) {
            authReviewed = await prompts.confirm(
              `speeq sees no sign-in check in ${c.location.file}. Does GET ${c.path} return only the signed-in user's own data?`,
              false,
            );
            if (!authReviewed)
              return ui.warn("Left off. Add a sign-in check to the endpoint, then try again.");
          }
          const choice = {
            fields,
            load: current()?.load ?? "on-demand",
            description: current()?.description ?? `${c.title} of the signed-in customer`,
            ...(authReviewed ? { authReviewed } : {}),
          } as const;
          const r = contextSpec(c, choice);
          if (!r.ok) return ui.fail(r.detail);
          put({
            id: c.id,
            path: c.path,
            category: c.category,
            description: r.spec.description,
            fields,
            load: r.spec.load,
            ...(authReviewed ? { authReviewed: true } : {}),
          });
          if (!d.identity?.binding)
            ui.warn(
              "Sources need a signed-in user. Bind sign-in in section 05, or they never run.",
            );
          ui.ok(`${c.id}: ${fields.join(", ")}`);
        },
      },
      {
        id: "load",
        label: "Loading",
        value: () => current()?.load ?? "on-demand",
        edit: async () => {
          const s = current();
          if (!s) return ui.warn("Approve fields first.");
          const v = await pick(
            st,
            "When to load it",
            [
              {
                value: "on-demand",
                label: "on demand",
                hint: "when a question needs it (recommended)",
              },
              {
                value: "initial",
                label: "with every message",
                hint: "small, always-relevant data only",
              },
            ],
            s.load,
          );
          if (v) put({ ...s, load: v });
        },
      },
      {
        id: "description",
        label: "Description for the agent",
        value: () => show(current()?.description),
        edit: () =>
          editText(
            st,
            "What this source tells the agent",
            current()?.description,
            (v) => {
              const s = current();
              if (s && v) put({ ...s, description: v });
            },
            200,
          ),
      },
      {
        id: "greeting",
        label: "Fields greetings may use",
        value: () => list(current()?.greeting),
        edit: async () => {
          const s = current();
          if (!s) return ui.warn("Approve fields first.");
          const v = await prompts.multiselect(
            "Fields a greeting may mention (e.g. count)",
            s.fields.map((f) => ({ value: f, label: f })),
            s.greeting ?? [],
          );
          put({ ...s, ...(v.length ? { greeting: v } : { greeting: undefined }) });
        },
      },
      {
        id: "off",
        label: "Turn it off",
        value: () => (current() ? "on" : "off"),
        edit: async () => put(undefined),
      },
    ],
    "Bound sources call your own endpoint with the visitor's cookies, so your endpoint keeps deciding what they may see. Only approved fields reach the model; restricted fields can never be approved.",
    () => sourceDetail(st, c),
  );
}
export async function contextSection(st: ControlState) {
  const all = candidates(st);
  const prompts = st.ctx.env.prompts;
  const ui = uiOf(st.ctx);
  if (!prompts) return;
  for (;;) {
    ui.note(
      all.length
        ? `${all.map((c) => sourceLine(st, c)).join("\n")}\n\n${pc.dim("Restricted always: passwords, tokens, payment details, OTPs, government ids.")}`
        : "No endpoints that look like customer data were found (for example /api/cart, /api/orders, /api/me).\nYou can still add a defineContext({ ... }) in speeq.config.ts.",
      "06 Customer context and permissions",
    );
    const id = await prompts.select("Review a source", [
      ...all.map((c) => ({
        value: c.path,
        label: `${c.id}  ${c.path}`,
        hint: sourceLine(st, c).split("  ")[0] ?? "",
      })),
      { value: BACK, label: "← Back to home", hint: "" },
    ]);
    if (id === BACK) return;
    const c = all.find((x) => x.path === id);
    if (c) await editSource(st, c);
  }
}

// ---------------------------------------------------------------- 07 Page context

export async function pageSection(st: ControlState) {
  const d = st.draft;
  const page = () => d.context?.page;
  await menu(
    st,
    "07 Page and application context",
    [
      {
        id: "allow",
        label: "Page keys the agent may see",
        value: () => list(page()?.allow),
        edit: () =>
          editList(
            st,
            "Keys from useSpeeqContext (selectedProductId, filters)",
            page()?.allow,
            (v) => (d.context = { ...d.context, page: v ? { ...page(), allow: v } : undefined }),
          ),
      },
      {
        id: "store",
        label: "What the audit log keeps",
        value: () => page()?.store ?? "keys",
        edit: async () => {
          const p = page();
          if (!p) return uiOf(st.ctx).warn("Allow some keys first.");
          const v = await pick(
            st,
            "Stored with each message",
            [
              { value: "keys", label: "key names only" },
              { value: "full", label: "keys and values" },
              { value: "none", label: "nothing" },
            ],
            p.store ?? "keys",
          );
          if (v) d.context = { ...d.context, page: { ...p, store: v } };
        },
      },
    ],
    "The page path and title always reach the agent. Data your pages register with useSpeeqContext is shown only for the keys you allow here, and is treated as untrusted. The whole page is never sent.",
  );
}

// ---------------------------------------------------------------- 08 Greetings and starters

function sample(st: ControlState, template: string): string {
  return template
    .replace(/\{name\}/g, pc.cyan("Ravi"))
    .replace(/\{business\}/g, st.draft.business?.name ?? pc.dim("{business}"))
    .replace(/\{agent\}/g, st.name)
    .replace(/\{[a-z][a-z0-9_]*\.[A-Za-z_]\w*\}/g, pc.cyan("2"));
}
function greetingPreview(st: ControlState): string {
  const g = st.draft.greeting;
  if (g?.enabled === false) return "Greetings are off. The chat box shows its own short hello.";
  const first = (x: string[] | undefined, ...rest: (string[] | undefined)[]) =>
    x?.[0] ?? rest.find((r) => r?.[0])?.[0];
  const rows: [string, string | undefined][] = [
    ["Guest", first(g?.guest)],
    ["Member", first(g?.member, g?.guest)],
    ["Returning", first(g?.returning, g?.member, g?.guest)],
  ];
  const starters = (st.draft.starters ?? [])
    .slice(0, 4)
    .map((s) => `[${s.label}]${s.when?.auth ? pc.dim(` ${s.when.auth}`) : ""}`)
    .join(" ");
  return [
    ...rows.map(([k, v]) => `${k.padEnd(10)} ${v ? sample(st, v) : pc.dim("chat box default")}`),
    "",
    `Starters   ${starters || pc.dim("none")}`,
    pc.dim("Sample data only (Ravi, 2). Missing values skip a line; nothing is invented."),
  ].join("\n");
}
export async function greetingSection(st: ControlState) {
  const d = st.draft;
  const g = () => d.greeting ?? {};
  const set = (patch: Partial<NonNullable<AgentChoices["greeting"]>>): void => {
    d.greeting = { ...g(), ...patch };
  };
  await menu(
    st,
    "08 Greetings and starter prompts",
    [
      {
        id: "enabled",
        label: "Greeting",
        value: () => (g().enabled === false ? "off" : "on"),
        edit: async () =>
          set({
            enabled:
              (await st.ctx.env.prompts?.confirm(
                "Show a greeting when the chat opens?",
                g().enabled !== false,
              )) ?? true,
          }),
      },
      {
        id: "guest",
        label: "For guests",
        value: () => list(g().guest, " | "),
        edit: () =>
          editList(
            st,
            "Guest greetings ({business}, {agent})",
            g().guest,
            (v) => set({ guest: v }),
            "|",
          ),
      },
      {
        id: "member",
        label: "For signed-in users",
        value: () => list(g().member, " | "),
        edit: () =>
          editList(
            st,
            "Member greetings ({name}, {business})",
            g().member,
            (v) => set({ member: v }),
            "|",
          ),
      },
      {
        id: "returning",
        label: "For returning users",
        value: () => list(g().returning, " | "),
        edit: () =>
          editList(
            st,
            "Returning greetings ({name}, {cart.count})",
            g().returning,
            (v) => set({ returning: v }),
            "|",
          ),
      },
      {
        id: "frequency",
        label: "How often",
        value: () => g().frequency ?? "once-per-session",
        edit: async () => {
          const v = await pick(
            st,
            "Greeting frequency",
            [
              { value: "once-per-session", label: "once per visit" },
              { value: "every-open", label: "every time the chat opens" },
            ],
            g().frequency,
          );
          if (v) set({ frequency: v });
        },
      },
      {
        id: "delay",
        label: "Delay",
        value: () => `${g().delayMs ?? 600} ms`,
        edit: () =>
          editNumber(st, "Milliseconds before the greeting shows", g().delayMs, 0, 10_000, (v) =>
            set({ delayMs: v }),
          ),
      },
      {
        id: "starters",
        label: "Starter prompts",
        value: () => list((d.starters ?? []).map((s) => s.label)),
        edit: async () => {
          const prompts = st.ctx.env.prompts;
          if (!prompts) return;
          const preset = presetById(d.preset ?? "general");
          const known = new Map<
            string,
            { label: string; when?: { auth?: "guest" | "member"; requires?: string[] } }
          >();
          for (const s of [
            ...(d.starters ?? []),
            ...(preset?.starters ?? []).map((p) => ({
              label: p.label,
              ...(p.auth || p.requires
                ? {
                    when: {
                      ...(p.auth ? { auth: p.auth } : {}),
                      ...(p.requires ? { requires: p.requires } : {}),
                    },
                  }
                : {}),
            })),
          ])
            if (!known.has(s.label)) known.set(s.label, s);
          const picked = await prompts.multiselect(
            "Starters (each is shown only when its page, sign-in state and capability exist)",
            [...known.values()].map((s) => ({
              value: s.label,
              label: s.label,
              hint: [s.when?.auth, ...(s.when?.requires ?? [])].filter(Boolean).join(", "),
            })),
            (d.starters ?? []).map((s) => s.label),
          );
          const extra = (
            await prompts.text("Add your own (separate with |, Enter for none)")
          ).trim();
          d.starters = [
            ...picked.flatMap((l) =>
              known.get(l) ? [known.get(l) as NonNullable<AgentChoices["starters"]>[number]] : [],
            ),
            ...extra
              .split("|")
              .map((x) => x.trim())
              .filter(Boolean)
              .map((label) => ({ label: label.slice(0, 60) })),
          ].slice(0, 12);
        },
      },
      {
        id: "chips",
        label: "Show starters with the greeting",
        value: () => (g().showStarters === false ? "no" : "yes"),
        edit: async () =>
          set({
            showStarters:
              (await st.ctx.env.prompts?.confirm(
                "Show starter prompts?",
                g().showStarters !== false,
              )) ?? true,
          }),
      },
    ],
    "Greetings are chosen on the server from real, approved values, without a model call. A line whose placeholder has no value is skipped, so names and counts are never invented. Starters that need a missing capability are never shown.",
    () => greetingPreview(st),
  );
}

// ---------------------------------------------------------------- 09 Memory

export async function memorySection(st: ControlState) {
  const d = st.draft;
  const m = () => d.memory ?? { mode: "session" as const };
  const set = (patch: Partial<NonNullable<AgentChoices["memory"]>>) =>
    (d.memory = { ...m(), ...patch });
  await menu(
    st,
    "09 Conversation memory",
    [
      {
        id: "mode",
        label: "Mode",
        value: () => m().mode,
        edit: async () => {
          const v = await pick(
            st,
            "What should the assistant remember?",
            [
              {
                value: "session",
                label: "This conversation only",
                hint: "default, nothing kept between visits",
              },
              {
                value: "persistent",
                label: "Continue conversations",
                hint: "signed-in users pick up where they left off",
              },
              {
                value: "preferences",
                label: "Also remember stated preferences",
                hint: "only what users say, e.g. 'answer in Telugu'",
              },
            ],
            m().mode,
          );
          if (!v) return;
          set({ mode: v });
          if (v !== "session" && !d.identity?.binding)
            uiOf(st.ctx).warn(
              "Memory is kept only for signed-in users. Bind sign-in in section 05.",
            );
          if (v !== "session" && (d.store?.kind ?? "memory") === "memory")
            uiOf(st.ctx).warn(
              "The memory store forgets everything on restart. Choose MongoDB in section 10.",
            );
        },
      },
      {
        id: "resume",
        label: "Continue within",
        value: () => `${m().resumeWithinHours ?? 72} hours`,
        edit: () =>
          editNumber(
            st,
            "Hours after which a conversation starts fresh",
            m().resumeWithinHours,
            1,
            2160,
            (v) => set({ resumeWithinHours: v }),
          ),
      },
      {
        id: "categories",
        label: "Preferences that may be kept",
        value: () => (m().mode === "preferences" ? list(m().categories ?? ["all"]) : "off"),
        edit: async () => {
          const v = await st.ctx.env.prompts?.multiselect(
            "Preference categories",
            [
              "language",
              "explanation_depth",
              "subject",
              "product_category",
              "communication_style",
            ].map((x) => ({ value: x, label: x })),
            m().categories ?? [
              "language",
              "explanation_depth",
              "subject",
              "product_category",
              "communication_style",
            ],
          );
          if (v) set({ categories: v });
        },
      },
      {
        id: "days",
        label: "Keep preferences for",
        value: () => `${m().preferenceDays ?? 180} days`,
        edit: () =>
          editNumber(st, "Days a preference is kept", m().preferenceDays, 1, 3650, (v) =>
            set({ preferenceDays: v }),
          ),
      },
      {
        id: "clear",
        label: "When users clear memory",
        value: () => `${m().clear ?? "forget"}${m().allowClear === false ? " (turned off)" : ""}`,
        edit: async () => {
          const v = await pick(
            st,
            "Clearing",
            [
              {
                value: "forget",
                label: "forget",
                hint: "hidden from the agent; audit rows kept until retention",
              },
              { value: "delete", label: "delete", hint: "removed now" },
              { value: "off", label: "users cannot clear", hint: "for strict audit policies" },
            ],
            m().allowClear === false ? "off" : (m().clear ?? "forget"),
          );
          if (v === "off") set({ allowClear: false });
          else if (v) set({ clear: v, allowClear: true });
        },
      },
    ],
    "Memory never replaces your app's data: a remembered subject is not proof of an enrollment. Anonymous visitors always get a fresh conversation, and an account switch never shows another person's memory.",
  );
}

// ---------------------------------------------------------------- 10 Storage

export async function storageSection(st: ControlState) {
  const d = st.draft;
  const ui = uiOf(st.ctx);
  const prompts = st.ctx.env.prompts;
  if (!prompts) return;
  await menu(
    st,
    "10 Storage and retention",
    [
      {
        id: "store",
        label: "Conversation storage",
        value: () =>
          `${d.store?.kind ?? "memory"}${d.store?.status ? ` · ${d.store.status.replace(/-/g, " ")}` : ""}`,
        edit: async () => {
          const v = await pick(
            st,
            "Where conversations are kept",
            [
              { value: "memory", label: "Memory", hint: "development: lost on restart" },
              { value: "mongodb", label: "MongoDB", hint: "persistent, your own database" },
            ],
            d.store?.kind ?? "memory",
          );
          if (!v) return;
          if (v === "memory") {
            d.store = { kind: "memory" };
            st.c.extraEnv = [];
            return;
          }
          const existing = await envValue(st, "SPEEQ_MONGODB_URI");
          let uri = existing;
          if (
            !existing ||
            (await prompts.confirm("Replace the MongoDB URI already saved?", false))
          ) {
            uri = (
              await prompts.password("MongoDB connection URI (hidden; saved only in .env.local)")
            ).trim();
            if (!uri) return ui.warn("No URI given. Nothing changed.");
            if (!/^mongodb(\+srv)?:\/\//.test(uri))
              return ui.fail(
                "That does not look like a MongoDB URI (mongodb:// or mongodb+srv://).",
              );
            st.c.values.SPEEQ_MONGODB_URI = uri;
          }
          const db = (
            await prompts.text(
              "Database name (Enter for the one in the URI)",
              (await envValue(st, "SPEEQ_MONGODB_DB")) ?? "",
            )
          ).trim();
          if (db) st.c.values.SPEEQ_MONGODB_DB = db;
          st.c.extraEnv = ["SPEEQ_MONGODB_URI", "SPEEQ_MONGODB_DB"];
          d.store = { kind: "mongodb", status: "configured" };
          ui.ok("MongoDB configured. The URI is never printed.");
          if (
            await prompts.confirm(
              "Check the connection now? (connects, writes one document to speeq_probe and deletes it; reads nothing else)",
              true,
            )
          ) {
            const busy = ui.busy("Checking MongoDB");
            const r = await checkMongo(st, uri as string, db || undefined);
            busy.stop(
              r.ok ? `Connection verified ${pc.dim(`· ${r.ms} ms`)}` : `MongoDB: ${r.message}`,
              r.ok,
            );
            if (r.ok) d.store = { kind: "mongodb", status: "connection-verified" };
          }
        },
      },
      {
        id: "retention",
        label: "Delete conversations after",
        value: () =>
          d.memory?.retentionDays ? `${d.memory.retentionDays} days` : "never (no retention set)",
        edit: () =>
          editNumber(
            st,
            "Days to keep conversations (they are also the audit log)",
            d.memory?.retentionDays,
            1,
            3650,
            (v) =>
              (d.memory = { mode: d.memory?.mode ?? "session", ...d.memory, retentionDays: v }),
          ),
      },
    ],
    "speeq keeps only its own conversations and preferences. Your customer data stays in your app. MongoDB credentials go to .env.local only, and speeq never runs migrations or reads other collections.",
  );
}

// ---------------------------------------------------------------- 11 Chat box

export async function chatSection(st: ControlState) {
  await runStep(st.ctx, st.io, st.c, "chat", true);
}
