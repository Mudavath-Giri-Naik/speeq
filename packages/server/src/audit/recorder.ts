import {
  type ConversationEventType,
  type ConversationStore,
  createId,
  type NewConversationEvent,
  type NewConversationEventOf,
  redactKeys,
} from "@speeq/core";
import type { AuditConfig, SpeeqLogger } from "../config.js";

/** Applies the built-in secret-key redaction to the parts of an event that hold tool args. */
export function defaultRedact(event: NewConversationEvent): NewConversationEvent {
  switch (event.type) {
    case "tool.called":
      return { ...event, data: { ...event.data, args: redactKeys(event.data.args) } };
    case "ui.action.requested":
      return { ...event, data: { ...event.data, args: redactKeys(event.data.args) } };
    case "confirmation.requested":
      return { ...event, data: { ...event.data, args: redactKeys(event.data.args) } };
    case "assistant.message":
      if (!event.data.toolCalls) return event;
      return {
        ...event,
        data: {
          ...event.data,
          toolCalls: event.data.toolCalls.map((c) => ({ ...c, args: redactKeys(c.args) })),
        },
      };
    default:
      return event;
  }
}

/**
 * Writes audit events for one session. Every event passes through the built-in redaction and
 * then `audit.redact`. A storage failure is logged and does not break the turn.
 */
export class AuditRecorder {
  constructor(
    private readonly config: { audit: AuditConfig; logger: SpeeqLogger },
    private readonly store: ConversationStore,
    private readonly sessionId: string,
    private readonly userId: string | null,
  ) {}

  /** Builds an event with ids and timestamps filled in (not yet redacted or stored). */
  build<T extends ConversationEventType>(
    type: T,
    data: NewConversationEventOf<T>["data"],
    meta: { turnId?: string; dedupeKey?: string } = {},
  ): NewConversationEvent {
    const event = {
      id: createId("evt"),
      sessionId: this.sessionId,
      ts: new Date().toISOString(),
      userId: this.userId,
      type,
      data,
      ...(meta.turnId ? { turnId: meta.turnId } : {}),
      ...(meta.dedupeKey ? { dedupeKey: meta.dedupeKey } : {}),
    };
    return event as NewConversationEvent;
  }

  /** Redacts an event; returns `null` if `audit.redact` dropped it. */
  redact(event: NewConversationEvent): NewConversationEvent | null {
    const base = defaultRedact(event);
    const custom = this.config.audit.redact;
    if (!custom) return base;
    try {
      const out = custom(base);
      // The dedupe key protects confirmation integrity: never let redaction remove it.
      if (out && event.dedupeKey) return { ...out, dedupeKey: event.dedupeKey };
      return out;
    } catch (error) {
      this.config.logger.error(
        "audit.redact threw; storing the event with default redaction",
        error,
      );
      return base;
    }
  }

  /** Builds, redacts and stores one event. Never throws. */
  async record<T extends ConversationEventType>(
    type: T,
    data: NewConversationEventOf<T>["data"],
    meta: { turnId?: string } = {},
  ): Promise<void> {
    const event = this.redact(this.build(type, data, meta));
    if (!event) return;
    try {
      await this.store.appendEvents(this.sessionId, [event]);
    } catch (error) {
      this.config.logger.error(`failed to store audit event "${type}"`, error);
    }
  }

  /** Stores an event and lets errors (e.g. `CONFLICT` from a dedupe key) propagate. */
  async recordStrict<T extends ConversationEventType>(
    type: T,
    data: NewConversationEventOf<T>["data"],
    meta: { turnId?: string; dedupeKey?: string },
  ): Promise<void> {
    const built = this.build(type, data, meta);
    const event = this.redact(built) ?? built;
    await this.store.appendEvents(this.sessionId, [event]);
  }
}
