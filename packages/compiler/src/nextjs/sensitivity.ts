import type { Sensitivity } from "@speeq/core/manifest";

function set(list: string) {
  return new Set(list.split(" "));
}
const sets: readonly [Sensitivity, ReadonlySet<string>][] = [
  [
    "credentials",
    set(
      "login signin sign-in signup sign-up register auth oauth callback logout signout password reset-password forgot-password verify-email verify otp 2fa mfa session",
    ),
  ],
  ["admin", set("admin administrator internal backoffice cron webhook webhooks debug _next")],
  [
    "financial",
    set(
      "checkout payment payments billing invoice invoices subscription subscriptions refund payout wallet",
    ),
  ],
  ["personal", set("account profile settings me orders order address addresses")],
];
/** Split a name into lowercase words (camelCase, snake_case, kebab-case). */
export function words(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}
/** Classify by lowercase path segments or words. The first matching category in policy order wins. */
export function sensitivityOf(parts: readonly string[]): Sensitivity {
  const lower = parts.map((p) => p.toLowerCase());
  for (const [kind, names] of sets) if (lower.some((p) => names.has(p))) return kind;
  return "none";
}
/** Classify a URL path. Dynamic segments carry no meaning and are ignored. */
export function sensitivityOfPath(path: string): Sensitivity {
  return sensitivityOf(path.split("/").filter((s) => s && !s.startsWith("[")));
}
/** Classify a source file path and export name by directory names, file stem and words. */
export function sensitivityOfSymbol(file: string, name: string): Sensitivity {
  const parts = file
    .replace(/\.[a-z]+$/i, "")
    .split("/")
    .flatMap((p) => [p, ...words(p)]);
  return sensitivityOf([...parts, ...words(name)]);
}
