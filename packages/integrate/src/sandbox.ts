import vm from "node:vm";
import * as server from "@speeq/server";
import ts from "typescript";
import * as zod from "zod";

/** One call that reached a stubbed host module. */
export interface HostCall {
  module: string;
  name: string;
}
/** A generated module evaluated with host code replaced by stubs. */
export interface Loaded {
  exports: Record<string, unknown>;
  calls: HostCall[];
}

/**
 * Evaluate a generated TypeScript module (`.speeq/generated/*.ts`) without running host code.
 *
 * Only call this with content whose ownership is `owned` (marker and hash verified): the text is
 * produced by speeq's own renderer, which escapes every identifier and string. `node:vm` is not a
 * security boundary; the guarantee here is that no host module is ever resolved. Every import other
 * than `speeq/server` and `zod` resolves to a stub that records the call and returns `{ stub: true }`,
 * and `bindEndpoint` is a stub that makes no request.
 */
export function loadGenerated(source: string): Loaded {
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const calls: HostCall[] = [];
  const stubs = new Map<string, unknown>();
  const hostModule = (spec: string) => {
    const hit = stubs.get(spec);
    if (hit) return hit;
    const fns = new Map<string, unknown>();
    const mod = new Proxy(
      {},
      {
        get(_t, key) {
          if (key === "__esModule") return true;
          if (typeof key !== "string" || key === "then") return undefined;
          let fn = fns.get(key);
          if (!fn) {
            fn = async () => {
              calls.push({ module: spec, name: key });
              return { stub: true };
            };
            fns.set(key, fn);
          }
          return fn;
        },
      },
    );
    stubs.set(spec, mod);
    return mod;
  };
  const stubRequire = (spec: string): unknown => {
    if (spec === "speeq/server")
      return {
        ...server,
        bindEndpoint: () => async () => {
          calls.push({ module: "bindEndpoint", name: "call" });
          return { stub: true };
        },
      };
    if (spec === "zod") return zod;
    return hostModule(spec);
  };
  const module = { exports: {} as Record<string, unknown> };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: stubRequire,
    process: { env: {} },
  });
  new vm.Script(js, { filename: "speeq-generated.js" }).runInContext(context, { timeout: 2000 });
  return { exports: module.exports, calls };
}
