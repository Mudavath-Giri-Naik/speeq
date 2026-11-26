import { twMerge } from "tailwind-merge";

type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, unknown>;

function join(inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string" || typeof input === "number") out.push(String(input));
    else if (Array.isArray(input)) out.push(join(input));
    else for (const [name, on] of Object.entries(input)) if (on) out.push(name);
  }
  return out.join(" ");
}

/** Joins class names and lets later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(join(inputs));
}
