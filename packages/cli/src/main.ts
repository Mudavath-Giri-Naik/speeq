import { spawn } from "node:child_process";
import { clackPrompter } from "./prompts.js";
import { run } from "./run.js";

const PLAIN = /^[\w@./:=^~+-]+$/;

/** Run the CLI against the real process and set `process.exitCode`. Used by the `speeq` executable. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  process.exitCode = await run(argv, {
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY,
    ...(isTTY ? { prompts: clackPrompter } : {}),
    exec: (command, args, cwd) =>
      new Promise((resolve) => {
        // Windows needs a shell to find `npm.cmd`. Passing args with `shell` is deprecated, so join
        // them into one string, which is only done for plain tokens (no quoting needed, no injection).
        const win = process.platform === "win32";
        if (win && ![command, ...args].every((a) => PLAIN.test(a))) return resolve(1);
        // Child output goes to stderr so `--json` keeps stdout clean.
        const child = spawn(win ? [command, ...args].join(" ") : command, win ? [] : args, {
          cwd,
          stdio: ["inherit", 2, 2],
          shell: win,
        });
        child.on("close", (c) => resolve(c ?? 1));
        child.on("error", () => resolve(1));
      }),
  });
}
