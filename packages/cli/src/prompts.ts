import { cancel, confirm, isCancel, multiselect, password, select, text } from "@clack/prompts";
import { CliExit, EXIT, type Prompter } from "./types.js";

function ok<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    throw new CliExit(EXIT.failure, "Cancelled.", "cancelled");
  }
  return value as T;
}
type Opt<T extends string> = { value: T; label: string; hint?: string };
const plain = (options: Opt<string>[]) =>
  options.map((o) => ({ value: o.value, label: o.label, ...(o.hint ? { hint: o.hint } : {}) }));
/** Terminal prompts backed by @clack/prompts. Cancelling (Ctrl+C) ends the command with exit code 1. */
export const clackPrompter: Prompter = {
  async confirm(message, initial = false) {
    return ok<boolean>(await confirm({ message, initialValue: initial }));
  },
  async select<T extends string>(message: string, options: Opt<T>[]) {
    return ok<string>(await select<string>({ message, options: plain(options) })) as T;
  },
  async multiselect<T extends string>(message: string, options: Opt<T>[], initial: T[] = []) {
    return ok<string[]>(
      await multiselect<string>({
        message,
        options: plain(options),
        initialValues: initial,
        required: false,
      }),
    ) as T[];
  },
  async text(message, initial = "") {
    return ok<string>(await text({ message, initialValue: initial }));
  },
  async password(message) {
    return ok<string>(await password({ message, mask: "*" }));
  },
};
