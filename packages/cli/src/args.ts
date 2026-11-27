import { parseArgs } from "node:util";
import type { Flags } from "./types.js";

/** Commands the CLI knows. Bare `speeq` is `configure`. */
export const COMMANDS = [
  "init",
  "scan",
  "configure",
  "capabilities",
  "verify",
  "doctor",
  "rollback",
  "upgrade",
] as const;

/** Parse `argv`. Throws `Error` with a usage message for unknown flags or commands. */
export function parseCommandLine(argv: string[]): {
  command: string;
  args: string[];
  flags: Flags;
} {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      diff: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      ci: { type: "boolean", default: false },
      install: { type: "boolean", default: false },
      "forward-auth": { type: "boolean", default: false },
      "no-confirm": { type: "boolean", default: false },
      "run-host": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      cwd: { type: "string" },
      app: { type: "string" },
      provider: { type: "string" },
      kind: { type: "string" },
      status: { type: "string" },
      access: { type: "string" },
      auth: { type: "string" },
      roles: { type: "string" },
      name: { type: "string" },
    },
  });
  const [first, ...rest] = positionals;
  const command = first ?? "configure";
  if (!(COMMANDS as readonly string[]).includes(command))
    throw new Error(`Unknown command "${command}".`);
  const flags: Flags = {
    json: values.json === true,
    dryRun: values["dry-run"] === true,
    diff: values.diff === true,
    yes: values.yes === true,
    ci: values.ci === true,
    install: values.install === true,
    forwardAuth: values["forward-auth"] === true,
    noConfirm: values["no-confirm"] === true,
    runHost: values["run-host"] === true,
    help: values.help === true,
    version: values.version === true,
    ...(values.cwd ? { cwd: values.cwd } : {}),
    ...(values.app ? { app: values.app } : {}),
    ...(values.provider ? { provider: values.provider } : {}),
    ...(values.kind ? { kind: values.kind } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(values.access ? { access: values.access } : {}),
    ...(values.auth ? { auth: values.auth } : {}),
    ...(values.roles ? { roles: values.roles } : {}),
    ...(values.name ? { name: values.name } : {}),
  };
  return { command, args: first ? rest : [], flags };
}
/** Help text. */
export const HELP = `speeq: add a conversational agent to your Next.js app

Usage: speeq [command] [options]

Commands
  init                      Scan, review and integrate speeq into this app
  scan                      Rediscover capabilities and refresh .speeq/manifest.json
  configure                 Control center (also: bare \`speeq\`)
  capabilities list|show|enable|disable [id]
  upgrade                   Rescan, reconcile decisions, regenerate owned files
  rollback                  Undo the last apply (owned files only)
  doctor                    Check the environment and the integration files (static)
  verify                    Static checks plus a mock-runtime smoke and permission test

Options
  --json         One JSON document on stdout, no other output
  --dry-run      Show the plan, write nothing
  --diff         Show a diff of every file that would change
  --yes, --ci    Never prompt (also when CI is set or there is no terminal)
  --app <dir>    App directory in a monorepo
  --cwd <dir>    Project directory (default: current)
  --provider <mock|openai-compatible|gemini>
  --install      Install missing dependencies (init)
  --access <read|write> --auth <public|authenticated|roles> --roles a,b
  --forward-auth --no-confirm --name <tool>   (capabilities enable)
  --run-host     verify: also run the app's own type check (runs host commands)

Exit codes: 0 ok, 1 failure, 2 usage, 3 needs review, 4 unsupported
`;
