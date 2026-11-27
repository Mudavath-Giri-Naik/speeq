import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Access,
  accessSchema,
  type CapabilityKind,
  fileSchema,
  idSchema,
  kindSchema,
  type Support,
  supportSchema,
} from "@speeq/core/manifest";
/** Hand-labelled expectations for a fixture. */
export interface GroundTruth {
  fixture: string;
  supported: boolean;
  capabilities: {
    id: string;
    kind: CapabilityKind;
    support: Support;
    access: Access;
    evidence: { file: string; line: number }[];
    executableWhenApproved: boolean;
  }[];
  unsupported: { code: string; file: string }[];
  forbidden: string[];
}
function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw Error("Expected an object");
  return x as Record<string, unknown>;
}
function array(x: unknown): unknown[] {
  if (!Array.isArray(x)) throw Error("Expected an array");
  return x;
}
function bool(x: unknown) {
  if (typeof x !== "boolean") throw Error("Expected boolean");
  return x;
}
/** Read and validate fixture labels as data. */
export async function loadGroundTruth(dir: string): Promise<GroundTruth> {
  const x = record(JSON.parse(await readFile(join(dir, "expected.json"), "utf8")));
  if (typeof x.fixture !== "string" || !x.fixture) throw Error("Missing fixture name");
  const capabilities = array(x.capabilities).map((value) => {
    const c = record(value);
    const id = idSchema.parse(c.id),
      kind = kindSchema.parse(c.kind);
    if (!id.startsWith(`${kind}:`)) throw Error("Inconsistent truth kind");
    const evidence = array(c.evidence).map((value) => {
      const e = record(value);
      if (typeof e.line !== "number" || !Number.isSafeInteger(e.line) || e.line < 1)
        throw Error("Invalid evidence line");
      return { file: fileSchema.parse(e.file), line: e.line };
    });
    if (!evidence.length) throw Error("Missing evidence");
    return {
      id,
      kind,
      evidence,
      support: supportSchema.parse(c.support),
      access: accessSchema.parse(c.access),
      executableWhenApproved: bool(c.executableWhenApproved),
    };
  });
  if (new Set(capabilities.map((c) => c.id)).size !== capabilities.length)
    throw Error("Duplicate truth id");
  return {
    fixture: x.fixture,
    supported: bool(x.supported),
    capabilities,
    unsupported: array(x.unsupported).map((value) => {
      const u = record(value);
      if (typeof u.code !== "string" || !/^SQ\d{4}$/.test(u.code))
        throw Error("Invalid diagnostic code");
      return { code: u.code, file: fileSchema.parse(u.file) };
    }),
    forbidden: array(x.forbidden).map((id) => idSchema.parse(id)),
  };
}
