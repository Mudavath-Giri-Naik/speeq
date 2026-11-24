/** A listener for event `K` of an event map `E`. */
export type Listener<E, K extends keyof E> = (payload: E[K]) => void;

/**
 * A tiny, typed event emitter. A listener that throws never breaks other listeners or the
 * emitter (the error is reported with `console.error`).
 *
 * @example
 * const em = new TypedEmitter<{ state: "idle" | "busy" }>();
 * const off = em.on("state", (s) => console.log(s));
 * em.emit("state", "busy");
 * off();
 */
export class TypedEmitter<E extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof E, Set<(payload: never) => void>>();

  /** Subscribes to `event`. Returns an unsubscribe function. */
  on<K extends keyof E>(event: K, listener: Listener<E, K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  /** Subscribes to the next `event` only. */
  once<K extends keyof E>(event: K, listener: Listener<E, K>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /** Removes a listener. */
  off<K extends keyof E>(event: K, listener: Listener<E, K>): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  /** Calls every listener for `event` with `payload`. */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<E, K>)(payload);
      } catch (error) {
        console.error("[speeq] event listener threw", error);
      }
    }
  }

  /** Removes every listener. */
  clear(): void {
    this.listeners.clear();
  }
}
