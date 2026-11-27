#!/usr/bin/env node
import { spawn } from "node:child_process";
import { clackPrompter } from "./prompts.js";
import { run } from "./run.js";

const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  isTTY,
  ...(isTTY ? { prompts: clackPrompter } : {}),
  exec: (command, args, cwd) =>
    new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      child.on("close", (c) => resolve(c ?? 1));
      child.on("error", () => resolve(1));
    }),
});
process.exitCode = code;
