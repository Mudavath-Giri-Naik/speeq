/** Reads a trimmed, nonempty setting. */
export function setting(name: string) {
  return process.env[name]?.trim() || undefined;
}
/** Retention in whole days, defaulting to ninety. */
export function retentionDays(value = setting("TELEMETRY_RETENTION_DAYS")) {
  const n = Number(value);
  return /^\d+$/.test(value ?? "") && Number.isInteger(n) && n >= 1 && n <= 3650 ? n : 90;
}
