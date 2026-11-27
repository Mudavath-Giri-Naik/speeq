/**
 * Name of the UI action that fills the form `formId` (a manifest capability id such as
 * `form:app/contact/page.tsx#form1`). Server, client and generated code all derive it here, so the
 * three cannot drift. The result always matches `/^ui_[a-z0-9_]{1,60}$/`.
 */
export function formFillActionName(formId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < formId.length; i++) {
    hash ^= formId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, "0").slice(0, 6);
  const slug = formId
    .toLowerCase()
    .replace(/^form:/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return `ui_fill_${slug || "form"}_${suffix}`;
}
