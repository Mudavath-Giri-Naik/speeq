import type { DataSourceCandidate } from "@speeq/compiler";
import { renderAgentModule, settingsPaths, wireAgentSettings } from "./agent-settings.js";
import type { ProjectFs } from "./fsx.js";
import { ownership, seal } from "./owned.js";
import { type ContextSourceSpec, contextSpec, renderContext, renderIdentity } from "./personal.js";
import type { IntegrationPlan, PlannedChange } from "./plan.js";
import { type Setup, setupPath, setupText } from "./setup.js";

/** What a control-center save would do, before anything is written. */
export interface SettingsPlan {
  plan: IntegrationPlan;
  /** Properties in speeq.config.ts that win over the terminal settings. */
  overrides: string[];
  /** Plain-language notes: skipped sources, manual steps. */
  notes: string[];
  /** Generated files edited by hand; they are only overwritten when listed in `force`. */
  edited: string[];
  /** The config could not be wired: the developer adds the snippet by hand. */
  manual?: { reason: string; snippet: string };
}

const blank = (prefix: string): IntegrationPlan => ({
  prefix,
  changes: [],
  wrapped: [],
  toolSpecs: [],
  forms: [],
  skipped: [],
  stale: [],
  pending: [],
  manual: [],
  dependencies: [],
  env: [],
  conflicts: [],
});

function change(
  path: string,
  before: string | undefined,
  after: string | undefined,
): PlannedChange {
  if (after === undefined)
    return before === undefined
      ? { path, action: "keep", ownership: "missing" }
      : { path, action: "delete", ownership: ownership(before), before };
  if (before === after) return { path, action: "keep", ownership: ownership(before) };
  return before === undefined
    ? { path, action: "create", ownership: "missing", content: after }
    : { path, action: "update", ownership: ownership(before), content: after, before };
}

/**
 * Plans a save of the control-center settings: `setup.json`, the generated `agent.ts`,
 * `identity.ts` and `context.ts`, and the one-time wiring of `speeq.config.ts`. Applied with
 * `applyPlan`, so the integration journal records it and `speeq rollback` undoes it.
 */
export async function planSettingsSave(o: {
  fs: ProjectFs;
  prefix: string;
  setup: Setup;
  /** Current discovery, used to re-check every approved source. */
  candidates: readonly DataSourceCandidate[];
  force?: readonly string[];
}): Promise<SettingsPlan> {
  const { fs, prefix, setup } = o;
  const paths = settingsPaths(prefix);
  const plan = blank(prefix);
  const notes: string[] = [];
  const edited: string[] = [];
  const add = (c: PlannedChange) => {
    if (c.action === "keep") return;
    if (c.ownership === "edited" && !(o.force ?? []).includes(c.path)) {
      edited.push(c.path);
      plan.conflicts.push(`${c.path} was edited by hand`);
      return;
    }
    plan.changes.push(c);
  };
  const generated = async (path: string, body: string | undefined) => {
    const before = await fs.read(path);
    if (before !== undefined && ownership(before) === "foreign") {
      notes.push(`${path} is yours (no speeq header), so it was left alone.`);
      return;
    }
    add(
      change(
        path,
        before,
        body === undefined ? undefined : body.startsWith("// speeq:generated") ? body : seal(body),
      ),
    );
  };

  const binding = setup.identity?.binding;
  const profile = (setup.identity?.expose ?? []).some(
    (f) => f === "displayName" || f === "preferredName",
  );
  await generated(
    paths.identity,
    binding ? renderIdentity(binding, paths.identity, { profile }) : undefined,
  );

  const specs: ContextSourceSpec[] = [];
  for (const s of setup.context?.sources ?? []) {
    const cand = o.candidates.find((c) => c.path === s.path);
    if (!cand) {
      notes.push(
        `Context source ${s.id} (${s.path}) was not found in the app any more and is left out.`,
      );
      continue;
    }
    const r = contextSpec(
      { ...cand, id: s.id },
      {
        fields: s.fields,
        load: s.load,
        description: s.description,
        ...(s.authReviewed ? { authReviewed: true } : {}),
        ...(s.greeting ? { greeting: s.greeting } : {}),
      },
    );
    if (r.ok) specs.push(r.spec);
    else notes.push(`Context source ${s.id} is left out: ${r.detail}`);
  }
  await generated(paths.context, specs.length ? renderContext(specs) : undefined);

  add(
    change(
      paths.agent,
      await fs.read(paths.agent),
      renderAgentModule({
        choices: setup,
        name: setup.name ?? "Assistant",
        languages: setup.languages,
        hasIdentity: !!binding,
        hasContext: specs.length > 0,
      }),
    ),
  );

  const sPath = setupPath(prefix);
  add(change(sPath, await fs.read(sPath), setupText(setup)));

  let overrides: string[] = [];
  let manual: SettingsPlan["manual"];
  const config = await fs.read(paths.config);
  if (config === undefined) {
    manual = { reason: `${paths.config} was not found`, snippet: snippet() };
  } else {
    const wired = wireAgentSettings(config, {
      configFile: paths.config,
      agentFile: paths.agent,
      mongo: setup.store?.kind === "mongodb",
    });
    if ("reason" in wired) manual = { reason: wired.reason, snippet: snippet() };
    else {
      overrides = wired.overrides;
      notes.push(...wired.notes);
      if (wired.text !== config)
        plan.changes.push({
          path: paths.config,
          action: "update",
          ownership: "foreign",
          content: wired.text,
          before: config,
        });
    }
  }
  return { plan, overrides, notes, edited, ...(manual ? { manual } : {}) };
}

function snippet(): string {
  return [
    'import { agentProfile, agentSettings } from "./.speeq/generated/agent";',
    "",
    "export const speeq = createSpeeq({",
    "  ...agentSettings,",
    "  agent: agentProfile,",
    "  // your llm, store, routes and tools stay as they are",
    "});",
  ].join("\n");
}
