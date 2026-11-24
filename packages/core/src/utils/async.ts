/**
 * Returns an `AbortSignal` that aborts when any input signal aborts, or after `timeoutMs`.
 * It uses `AbortSignal.any` / `AbortSignal.timeout` when available, with a manual fallback.
 */
export function combineSignals(
  signals: ReadonlyArray<AbortSignal | undefined>,
  timeoutMs?: number,
): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s !== undefined);
  if (timeoutMs !== undefined) list.push(AbortSignal.timeout(timeoutMs));
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list);
  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/** Resolves after `ms` milliseconds, or rejects early when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
