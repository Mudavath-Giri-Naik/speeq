import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliEnv, Prompter } from "../src/index.js";
import { run } from "../src/index.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/compiler/", import.meta.url));

/** A temporary copy of a compiler fixture plus a way to run the CLI against it. */
export async function app(fixture: string) {
  const dir = await mkdtemp(join(tmpdir(), "speeq-cli-"));
  await cp(join(fixtures, fixture), dir, { recursive: true });
  const api = {
    dir,
    /** Run the CLI. Returns the exit code and what it printed. */
    async cli(args: string[], over: Partial<CliEnv> = {}) {
      let stdout = "";
      let stderr = "";
      const env: CliEnv = {
        cwd: dir,
        env: {},
        stdout: { write: (t) => (stdout += t) },
        stderr: { write: (t) => (stderr += t) },
        isTTY: false,
        ...over,
      };
      const code = await run(args, env);
      return {
        code,
        stdout,
        stderr,
        json: () => JSON.parse(stdout.trim()) as Record<string, unknown>,
      };
    },
    read: (f: string) => readFile(join(dir, f), "utf8"),
    write: async (f: string, t: string) => {
      await mkdir(dirname(join(dir, f)), { recursive: true });
      await writeFile(join(dir, f), t);
    },
    snapshot: () => snapshot(dir),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
  return api;
}
async function snapshot(dir: string, sub = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await snapshot(dir, rel));
    else out[rel] = await readFile(join(dir, rel), "utf8");
  }
  return out;
}
/** A prompter that answers from a script and fails the test when asked something unexpected. */
export function scripted(answers: unknown[]): Prompter & { asked: string[] } {
  const asked: string[] = [];
  const next = (message: string) => {
    asked.push(message);
    if (!answers.length) throw new Error(`Unexpected prompt: ${message}`);
    return answers.shift();
  };
  return {
    asked,
    confirm: async (m) => next(m) as boolean,
    select: async (m) => next(m) as never,
    multiselect: async (m) => next(m) as never,
    text: async (m) => next(m) as string,
    password: async (m) => next(m) as string,
  };
}
/** A prompter that fails the test if it is ever used. */
export const noPrompts: Prompter = scripted([]);
