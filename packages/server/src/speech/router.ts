import { isSpeeqError, SpeeqError } from "@speeq/core";
/** Try only approved providers, with a deadline even if an adapter ignores abort. */
export async function runChain<T extends { id: string }, R>(
  providers: readonly T[],
  parent: AbortSignal,
  timeout: number,
  call: (p: T, signal: AbortSignal) => Promise<R>,
) {
  for (const p of providers) {
    parent.throwIfAborted();
    const signal = AbortSignal.any([parent, AbortSignal.timeout(timeout)]);
    let abort: () => void = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new SpeeqError("PROVIDER_ERROR"));
        signal.addEventListener("abort", abort, { once: true });
      });
      return await Promise.race([cancelled, call(p, signal)]);
    } catch (e) {
      parent.throwIfAborted();
      const code = isSpeeqError(e) ? e.code : "PROVIDER_ERROR";
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development")
        console.warn("[speeq] speech provider", p.id, code);
      if (code !== "RATE_LIMITED" && code !== "PROVIDER_ERROR") throw new SpeeqError(code);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  throw new SpeeqError("SPEECH_UNAVAILABLE");
}
