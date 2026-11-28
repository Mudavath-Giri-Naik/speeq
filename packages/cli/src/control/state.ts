import {
  type DataSourceCandidate,
  discoverPersonalization,
  type Personalization,
} from "@speeq/compiler";
import {
  type AgentChoices,
  agentWiring,
  type ControlInput,
  keyVariable,
  PROVIDERS,
  readAgentChoices,
  type Setup,
  settingsPaths,
} from "@speeq/integrate";
import { load, projectRoot } from "../load.js";
import type { Ctx, Loaded } from "../types.js";
import type { Choices, WizardIo } from "../wizard.js";

/** Everything the control center works on. Nothing here is written until Save. */
export interface ControlState {
  ctx: Ctx;
  io: WizardIo;
  root: string;
  /** The 0.11 wizard choices (model, voice, languages, chat box, env values). */
  c: Choices;
  /** Control-center settings being edited. */
  draft: AgentChoices;
  /** Assistant name (shown in the chat box and used by the agent). */
  name: string;
  /** What is on disk now. */
  saved: Setup;
  loaded?: Loaded;
  found?: Personalization;
}

/** A variable's value from `.env.local`, `.env` or the environment. In memory only, never printed. */
export async function envValue(st: ControlState, name: string): Promise<string | undefined> {
  if (st.c.values[name]) return st.c.values[name];
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const file of [`${st.io.prefix}.env.local`, `${st.io.prefix}.env`]) {
    const text = await st.io.fs.read(file);
    for (const line of text?.split(/\r?\n/) ?? []) {
      const raw = re
        .exec(line)?.[1]
        ?.trim()
        .replace(/^(["'])(.*)\1$/, "$2");
      if (raw && !raw.startsWith("#")) return raw;
    }
  }
  return st.ctx.env.env[name] || undefined;
}

/** Scan the app and run discovery (read only). */
export async function discover(st: ControlState): Promise<void> {
  const loaded = await load(st.ctx);
  st.loaded = loaded;
  const appDir = loaded.prefix ? loaded.prefix.replace(/\/$/, "") : undefined;
  st.found = await discoverPersonalization({
    root: projectRoot(st.ctx),
    ...(appDir ? { appDir } : {}),
    manifest: loaded.manifest,
  });
}

/** The data source candidates discovery found (empty before discovery). */
export const candidates = (st: ControlState): DataSourceCandidate[] => st.found?.dataSources ?? [];

/** The facts the home screen is computed from. */
export async function controlInput(st: ControlState): Promise<ControlInput> {
  const p = PROVIDERS.find((x) => x.id === st.c.provider);
  const key = p ? keyVariable(p) : undefined;
  const best = st.found?.auth.candidates[0];
  const config = await st.io.fs.read(settingsPaths(st.io.prefix).config);
  return {
    choices: st.draft,
    provider: st.c.provider,
    ...(st.c.model ? { model: st.c.model } : {}),
    keyPresent: !key || !!(await envValue(st, key)),
    voice: st.c.voice,
    languages: st.c.languages,
    ui: st.c.ui,
    ...(best ? { auth: { provider: best.provider, label: best.label, level: best.level } } : {}),
    sourceCount: candidates(st).length,
    wiring: config === undefined ? "unknown" : agentWiring(config),
    mongoUriPresent: !!(await envValue(st, "SPEEQ_MONGODB_URI")),
  };
}

/** The draft as stored: parsed through the same validation the file gets. */
export const normalized = (d: AgentChoices): AgentChoices =>
  readAgentChoices(JSON.parse(JSON.stringify(d)));
