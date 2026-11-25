/** Joins conditional CSS class names. */
export function cn(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(" ");
}
