import type { Capability, Diagnostic, Evidence, Framework } from "@speeq/core/manifest";
import type { RepoFs } from "./fs/repo-fs.js";
/** Framework detection evidence. */
export interface DetectResult {
  matches: boolean;
  framework?: Framework;
  evidence: Evidence[];
}
/** Capabilities and diagnostics discovered without executing the host. */
export interface DiscoveryResult {
  capabilities: Capability[];
  diagnostics: Diagnostic[];
}
/** Read-only framework discovery extension point. */
export interface FrameworkAdapter {
  readonly id: string;
  detect(fs: RepoFs): Promise<DetectResult>;
  discover(fs: RepoFs, options: { signal?: AbortSignal }): Promise<DiscoveryResult>;
}
