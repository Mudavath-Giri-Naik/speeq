export {
  type AgentChoices,
  agentWiring,
  type ControlInput,
  hasAgentChoices,
  type Recommendation,
  readAgentChoices,
  recommend,
  renderAgentModule,
  restartHint,
  SECTIONS,
  type SectionId,
  type SectionStatus,
  type SourceChoice,
  type StyleChoice,
  sectionStatuses,
  settingsPaths,
  wireAgentSettings,
} from "./agent-settings.js";
/**
 * `@speeq/integrate`: plans, previews, applies and rolls back speeq's changes to a host app.
 * The only package that writes files in a developer's project (ADR-0016).
 * @packageDocumentation
 */
export {
  type ApplyResult,
  applyPlan,
  previewRollback,
  type RollbackResult,
  rollback,
} from "./apply.js";
export {
  configProviderState,
  configStoreState,
  configVoiceState,
  keepStoreAcrossReloads,
  keyVariable,
  switchProvider,
  switchVoice,
} from "./config-switch.js";
export {
  decisionsPath,
  IntegrateError,
  manifestPath,
  readDecisions,
  serializeDecisions,
  setDecision,
  writeDecisions,
  writeManifest,
} from "./decisions.js";
export { lineDiff, renderDiff } from "./diff.js";
export {
  applyEnvValues,
  type EnvName,
  type EnvValueResult,
  ignoresEnvLocal,
  newSecret,
  planEnv,
} from "./env.js";
export { memoryFs, nodeFs, type ProjectFs } from "./fsx.js";
export { type LayoutSplice, spliceLayout } from "./layout.js";
export { type Ownership, ownership, seal, sha256 } from "./owned.js";
export {
  authStatus,
  type BindingStatus,
  type ContextRefusal,
  type ContextSourceSpec,
  contextSpec,
  renderContext,
  renderIdentity,
} from "./personal.js";
export {
  buildPlan,
  type IntegrationPlan,
  isEmptyPlan,
  type PlannedChange,
  type PlanOptions,
  reviewState,
  ZOD_VERSION,
} from "./plan.js";
export {
  type AgentPreset,
  guessPreset,
  PRESETS,
  type PresetGuess,
  type PresetId,
  type PresetStarter,
  presetById,
} from "./presets.js";
export {
  type EnvVar,
  FEATURES,
  type FeatureEntry,
  PROVIDERS,
  type ProviderEntry,
  provider,
  VOICES,
  type VoiceEntry,
  voice,
} from "./registry.js";
export {
  applyRemoval,
  envNamesIn,
  planRemoval,
  type RemovableFile,
  type RemovalPlan,
  type RemovalSelection,
  SHARED_NAMES,
  SPEEQ_ONLY_NAMES,
  stripEnvNames,
  unspliceLayout,
} from "./remove.js";
export type { FormSpec } from "./render.js";
export { isSecretName, renderZod } from "./schema.js";
export { planSettingsSave, type SettingsPlan } from "./settings-plan.js";
export { readSetup, type Setup, setupOf, setupPath, setupText } from "./setup.js";
export { type AssistantOptions, renderAssistant, type VoiceMode } from "./ui-template.js";
export {
  type Check,
  type Level,
  type VerifyInput,
  type VerifyReport,
  verifyProject,
} from "./verify.js";
