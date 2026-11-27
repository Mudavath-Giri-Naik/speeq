/**
 * `@speeq/cli`: the `speeq` command. A thin shell over `@speeq/compiler` and `@speeq/integrate`.
 * @packageDocumentation
 */
export { parseCommandLine } from "./args.js";
export { run } from "./run.js";
export { type CliEnv, EXIT, type Flags, type Prompter } from "./types.js";
export { SPEEQ_PACKAGE_VERSION } from "./version.js";
