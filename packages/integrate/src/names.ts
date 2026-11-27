/** Lower snake case from camel case or any text. */
export function snake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
/** Makes names unique by appending `_2`, `_3`... Truncates to 64 characters first. */
export function uniqueName(base: string, taken: Set<string>): string {
  const root = (base || "tool").slice(0, 60);
  let name = root.slice(0, 64);
  for (let i = 2; taken.has(name); i++) name = `${root}_${i}`;
  taken.add(name);
  return name;
}
