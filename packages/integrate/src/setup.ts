import { type AgentChoices, hasAgentChoices, readAgentChoices } from "./agent-settings.js";
import type { ProjectFs } from "./fsx.js";
import type { PlanOptions } from "./plan.js";

/**
 * The choices made during `speeq init` and `speeq setup`, remembered so `upgrade` regenerates the
 * same files. Version 2 adds the control-center settings (ADR-0024); version 1 files still read.
 */
export interface Setup extends AgentChoices {
  setupVersion: 1 | 2;
  provider: string;
  voice: "none" | "browser" | "cloud" | "sarvam";
  languages: string[];
  ui: boolean;
  env: boolean;
  name?: string;
}

/** Path of the setup file. It holds choices only: no keys, no values. */
export const setupPath = (prefix: string) => `${prefix}.speeq/setup.json`;

/** Read `.speeq/setup.json`; anything malformed is ignored (the defaults apply). */
export async function readSetup(fs: ProjectFs, prefix: string): Promise<Setup | undefined> {
  try {
    const text = await fs.read(setupPath(prefix));
    const v = text === undefined ? undefined : (JSON.parse(text) as Partial<Setup>);
    if (!v || (v.setupVersion !== 1 && v.setupVersion !== 2)) return undefined;
    const voices = ["none", "browser", "cloud", "sarvam"];
    if (typeof v.provider !== "string" || !voices.includes(String(v.voice))) return undefined;
    if (!Array.isArray(v.languages) || !v.languages.every((l) => typeof l === "string"))
      return undefined;
    const choices = readAgentChoices(v);
    return {
      ...choices,
      setupVersion: hasAgentChoices(choices) ? 2 : 1,
      provider: v.provider,
      voice: v.voice as Setup["voice"],
      languages: v.languages.slice(0, 6),
      ui: v.ui === true,
      env: v.env === true,
      ...(typeof v.name === "string" ? { name: v.name.slice(0, 40) } : {}),
    };
  } catch {
    return undefined;
  }
}
/** The text of `setup.json` for a setup: version 2 only when control-center settings exist. */
export function setupText(setup: Setup): string {
  const { provider, voice, languages, ui, env, name, setupVersion: _v, ...rest } = setup;
  const choices = readAgentChoices(rest);
  const v2 = hasAgentChoices(choices);
  const out = {
    setupVersion: v2 ? 2 : 1,
    provider,
    voice,
    languages,
    ui,
    env,
    ...(name ? { name } : {}),
    ...choices,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** The setup implied by plan options (what gets remembered). */
export function setupOf(o: PlanOptions): Setup {
  return {
    setupVersion: 1,
    provider: o.providerId ?? "mock",
    voice: o.voice ?? "browser",
    languages: [...(o.languages?.length ? o.languages : ["en-IN"])],
    ui: o.ui === true,
    env: o.env === true,
    ...(o.assistantName ? { name: o.assistantName } : {}),
  };
}
