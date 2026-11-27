/**
 * `@speeq/integrate`: plans, previews, applies and rolls back speeq's changes to a host app.
 * The only package that writes files in a developer's project (ADR-0016).
 * @packageDocumentation
 */
export { type ApplyResult, applyPlan, type RollbackResult, rollback } from "./apply.js";
export {
  decisionsPath,
  IntegrateError,
  manifestPath,
  readDecisions,
  serializeDecisions,
  setDecision,
  writeDecisions,
} from "./decisions.js";
export { lineDiff, renderDiff } from "./diff.js";
export { memoryFs, nodeFs, type ProjectFs } from "./fsx.js";
export { type Ownership, ownership, seal, sha256 } from "./owned.js";
export {
  buildPlan,
  type IntegrationPlan,
  isEmptyPlan,
  type PlannedChange,
  type PlanOptions,
  ZOD_VERSION,
} from "./plan.js";
export {
  type EnvVar,
  FEATURES,
  type FeatureEntry,
  PROVIDERS,
  type ProviderEntry,
  provider,
} from "./registry.js";
export { isSecretName, renderZod } from "./schema.js";
