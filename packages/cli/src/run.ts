import { isSpeeqError } from "@speeq/core";
import { type COMMANDS, HELP, parseCommandLine } from "./args.js";
import { capabilities } from "./commands/capabilities.js";
import { configure, init, upgrade } from "./commands/init.js";
import { rollbackCommand } from "./commands/rollback.js";
import { scanCommand } from "./commands/scan.js";
import { doctorCommand, verifyCommand } from "./commands/verify.js";
import { type CliEnv, CliExit, type Ctx, EXIT } from "./types.js";
import { SPEEQ_PACKAGE_VERSION } from "./version.js";

const handlers: Record<(typeof COMMANDS)[number], (ctx: Ctx) => Promise<number>> = {
  init,
  scan: scanCommand,
  configure,
  capabilities,
  upgrade,
  rollback: rollbackCommand,
  verify: verifyCommand,
  doctor: doctorCommand,
};
function wantsJson(argv: string[]) {
  return argv.includes("--json");
}
/** Run the CLI and return its exit code. Never throws and never calls `process.exit`. */
export async function run(argv: string[], env: CliEnv): Promise<number> {
  const json = wantsJson(argv);
  const emit = (command: string, exit: number, doc: Record<string, unknown>) => {
    env.stdout.write(
      `${JSON.stringify({ speeq: 1, command, ok: exit === EXIT.ok, exitCode: exit, errors: [], ...doc })}\n`,
    );
    return exit;
  };
  let parsed: ReturnType<typeof parseCommandLine>;
  try {
    parsed = parseCommandLine(argv);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid arguments.";
    if (json) return emit("unknown", EXIT.usage, { errors: [{ code: "usage", message }] });
    env.stderr.write(`${message}\n\n${HELP}`);
    return EXIT.usage;
  }
  const { command, args, flags } = parsed;
  if (flags.help) {
    env.stdout.write(HELP);
    return EXIT.ok;
  }
  if (flags.version) {
    env.stdout.write(`${SPEEQ_PACKAGE_VERSION}\n`);
    return EXIT.ok;
  }
  const interactive = env.isTTY && !flags.yes && !flags.ci && !flags.json && !env.env.CI;
  const ctx: Ctx = {
    command,
    args,
    flags,
    env,
    interactive,
    say: (text) => {
      if (!flags.json) env.stdout.write(`${text}\n`);
    },
    finish: (exit, doc = {}) => (flags.json ? emit(command, exit, doc) : exit),
  };
  try {
    return await handlers[command as (typeof COMMANDS)[number]](ctx);
  } catch (e) {
    if (e instanceof CliExit) {
      if (flags.json)
        return emit(command, e.exit, { ...e.doc, errors: [{ code: e.code, message: e.message }] });
      env.stderr.write(`error: ${e.message}\n`);
      return e.exit;
    }
    const message = isSpeeqError(e) || e instanceof Error ? e.message : "Unexpected failure.";
    if (flags.json) return emit(command, EXIT.failure, { errors: [{ code: "failure", message }] });
    env.stderr.write(`error: ${message}\n`);
    return EXIT.failure;
  }
}
