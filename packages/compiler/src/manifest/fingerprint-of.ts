import type { Capability } from "@speeq/core/manifest";
import { fingerprint } from "../fingerprint.js";

/** The fields that give a capability its meaning. Excludes id, file, line and evidence. */
type Semantic = Capability extends infer C
  ? C extends unknown
    ? Omit<C, "fingerprint" | "id" | "source" | "evidence">
    : never
  : never;
/**
 * Fingerprint of a capability's semantic fields (ADR-0015 point 3). Moving a file or editing
 * unrelated code never changes it. A changed schema, access level, method set or auth observation does.
 */
export function fingerprintOf(c: Semantic): string {
  const base = {
    kind: c.kind,
    access: c.access,
    sensitivity: c.sensitivity,
    support: c.support,
    auth: c.auth.observed,
  };
  let extra: unknown;
  switch (c.kind) {
    case "route":
      extra = { dynamic: c.dynamic, pathParams: c.pathParams, queryParams: c.queryParams };
      break;
    case "endpoint":
      extra = { methods: c.methods, input: c.input };
      break;
    case "function":
      extra = {
        name: c.export.name,
        isServerAction: c.export.isServerAction,
        input: c.input,
        validatesAtRuntime: c.validatesAtRuntime,
      };
      break;
    case "form":
      extra = { fields: c.fields };
      break;
    case "filter-set":
      extra = { parameters: c.parameters };
      break;
  }
  // JSON round trip drops undefined members, which canonical JSON rejects.
  return fingerprint(JSON.parse(JSON.stringify({ ...base, extra })));
}
