/**
 * A fixed-window counter kept in process memory.
 *
 * **Best effort only.** On serverless platforms each instance has its own memory, so the real
 * limit is roughly `limit × instances`. It still blunts loops and accidental floods on one warm
 * instance. For strict limits, put a shared limiter (e.g. at your edge or API gateway) in front.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = 60_000,
  ) {}

  /**
   * Counts one hit for `key`. Returns `null` when allowed, or the milliseconds until the window
   * resets when the limit is exceeded.
   */
  hit(key: string, now: number = Date.now()): number | null {
    this.sweep(now);
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return null;
    }
    w.count += 1;
    return w.count > this.limit ? this.windowMs - (now - w.start) : null;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

/** Best guess at the client IP from common proxy headers. Used only as a rate-limit key. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
