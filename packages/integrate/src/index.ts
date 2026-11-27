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
export { type EnvName, ignoresEnvLocal, newSecret, planEnv } from "./env.js";
export { memoryFs, nodeFs, type ProjectFs } from "./fsx.js";
export { type LayoutSplice, spliceLayout } from "./layout.js";
export { type Ownership, ownership, seal, sha256 } from "./owned.js";
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
export type { FormSpec } from "./render.js";
export { isSecretName, renderZod } from "./schema.js";
export { readSetup, type Setup, setupOf, setupPath } from "./setup.js";
export { type AssistantOptions, renderAssistant, type VoiceMode } from "./ui-template.js";
export {
  type Check,
  type Level,
  type VerifyInput,
  type VerifyReport,
  verifyProject,
} from "./verify.js";
