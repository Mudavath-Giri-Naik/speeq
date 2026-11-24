import type { SpeeqClientOptions } from "@speeq/client";

type GetContext = NonNullable<SpeeqClientOptions["getContext"]>;

/** Collects committed context hooks in registration order. */
export function createContextRegistry(base: GetContext) {
  const entries = new Set<() => Record<string, unknown>>();
  return {
    register(read: () => Record<string, unknown>) {
      entries.add(read);
      return () => {
        entries.delete(read);
      };
    },
    getContext() {
      const context = base();
      if (!entries.size) return context;
      return {
        ...context,
        data: Object.assign({}, context?.data, ...Array.from(entries, (read) => read())),
      };
    },
  };
}
