import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "@speeq/compiler";
import type { DecisionsFile, Manifest } from "@speeq/core/manifest";
import {
  buildPlan,
  type IntegrationPlan,
  nodeFs,
  type PlanOptions,
  type ProjectFs,
  setDecision,
} from "../src/index.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/compiler/", import.meta.url));

/** A temporary copy of a compiler fixture with scan and plan helpers. */
export async function project(name: string) {
  const dir = await mkdtemp(join(tmpdir(), "speeq-integrate-"));
  await cp(join(fixtures, name), dir, { recursive: true });
  const fs = nodeFs(dir);
  const rescan = async () => {
    const r = await scan({ root: dir });
    if (r.status !== "ok") throw new Error(`${name}: ${r.status}`);
    const app = r.project.app;
    const options: PlanOptions = {
      prefix: "",
      ...(app?.appRouterDir ? { appRouterDir: app.appRouterDir } : {}),
      speeqVersion: "0.4.0",
    };
    return { manifest: r.manifest, options };
  };
  const state = {
    manifest: undefined as Manifest | undefined,
    options: undefined as PlanOptions | undefined,
  };
  const api = {
    dir,
    fs,
    get manifest() {
      return state.manifest;
    },
    async scan() {
      const r = await rescan();
      state.manifest = r.manifest;
      state.options = r.options;
      return r.manifest;
    },
    approve(decisions: DecisionsFile | undefined, id: string, extra = {}) {
      return setDecision(decisions, state.manifest as Manifest, id, "enable", {
        auth: { requirement: "public" },
        ...extra,
      });
    },
    async plan(
      decisions?: DecisionsFile,
      over: Partial<PlanOptions> = {},
    ): Promise<IntegrationPlan> {
      return buildPlan({
        manifest: state.manifest as Manifest,
        decisions,
        fs,
        options: { ...(state.options as PlanOptions), ...over },
      });
    },
    write: (file: string, text: string) => writeFile(join(dir, file), text),
    read: (file: string) => readFile(join(dir, file), "utf8"),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
  await api.scan();
  return api;
}
/** Every file under a directory with its content, for before/after comparisons. */
export async function snapshot(dir: string, sub = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await snapshot(dir, rel));
    else out[rel] = await readFile(join(dir, rel), "utf8");
  }
  return out;
}
/** Wrap a file system and record writes and removals. */
export function spyFs(inner: ProjectFs, failOnWrite?: number) {
  const log: string[] = [];
  let writes = 0;
  const fs: ProjectFs = {
    ...inner,
    async write(p, c) {
      if (failOnWrite !== undefined && ++writes === failOnWrite) throw new Error("disk full");
      log.push(`write ${p}`);
      await inner.write(p, c);
    },
    async remove(p) {
      log.push(`remove ${p}`);
      await inner.remove(p);
    },
  };
  return { fs, log };
}
