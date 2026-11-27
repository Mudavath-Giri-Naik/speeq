import type { UiActionHandler } from "./types.js";

/** How the page exposes one of its forms to the assistant. No DOM access happens in speeq. */
export interface FormBinding {
  /** Writes draft values into the form. Called only with fields the user has not edited. */
  setValues(values: Record<string, string | number | boolean>): void | Promise<void>;
  /** True when the user changed this field. Dirty fields are never overwritten. */
  isDirty(name: string): boolean;
}

const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Builds the handler for a form fill action (`formFillActionName(formId)`). It writes a **draft**
 * only: it never submits, never overwrites a field the user edited and ignores anything that is
 * not a plain string, finite number or boolean. It reports what it did so the assistant can say so.
 */
export function createFormFillHandler(binding: FormBinding): UiActionHandler {
  return async (args) => {
    const raw =
      args && typeof args === "object" ? (args as { values?: unknown }).values : undefined;
    const entries =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? Object.entries(raw as Record<string, unknown>)
        : [];
    const draft: Record<string, string | number | boolean> = {};
    const applied: string[] = [];
    const rejected: { field: string; reason: "FIELD_DIRTY" | "FIELD_INVALID" }[] = [];
    for (const [field, value] of entries.slice(0, 30)) {
      const plain =
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value));
      if (!plain || PROTOTYPE_KEYS.has(field)) {
        rejected.push({ field, reason: "FIELD_INVALID" });
        continue;
      }
      let dirty = true; // if the page cannot tell, do not overwrite
      try {
        dirty = binding.isDirty(field);
      } catch {
        /* keep the safe default */
      }
      if (dirty) rejected.push({ field, reason: "FIELD_DIRTY" });
      else {
        draft[field] = value;
        applied.push(field);
      }
    }
    if (applied.length) await binding.setValues(draft);
    return { applied, rejected };
  };
}
