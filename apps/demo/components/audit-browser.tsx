"use client";

import { type ConversationEvent, useAuditSession, useAuditSessions } from "@speeq/react";
import { type JSX, useState } from "react";

const auditOptions = { endpoint: "/api/speeq", credentials: "include" } as const;
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function EventContent({ event }: { event: ConversationEvent }) {
  const type = event.type;
  switch (event.type) {
    case "user.message":
      return (
        <>
          <strong>User</strong> {event.data.text}
        </>
      );
    case "assistant.message":
      return (
        <>
          <strong>Vidya</strong> {event.data.text || "Requested a tool."}
        </>
      );
    case "tool.called": {
      const { name, result, ok, errorCode } = event.data;
      const preview = result && result.length > 160 ? `${result.slice(0, 160)}…` : result;
      return (
        <>
          <strong>Tool · {name}</strong> {ok ? preview : preview || errorCode || "Failed"}
        </>
      );
    }
    case "navigation":
      return (
        <>
          <strong>Opened</strong> {event.data.href}
        </>
      );
    case "confirmation.requested":
      return (
        <>
          <strong>Confirmation requested</strong> {event.data.summary}
        </>
      );
    case "confirmation.resolved":
      return <strong>Confirmation {event.data.approved ? "approved" : "declined"}</strong>;
    case "error":
      return (
        <>
          <strong>Error</strong> {event.data.message}
        </>
      );
    default:
      return <span className="muted">{type}</span>;
  }
}

/** Lists authorized sessions and shows the event history of the selected session. */
export function AuditBrowser(): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useAuditSessions(auditOptions);
  const detail = useAuditSession(selected, auditOptions);

  return (
    <div className="audit-browser">
      <section className="card audit-sessions" aria-labelledby="audit-sessions-title">
        <div className="audit-heading">
          <h2 id="audit-sessions-title">Sessions</h2>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              list.refresh();
              if (selected) detail.refresh();
            }}
          >
            Refresh
          </button>
        </div>
        {list.loading && <p role="status">Loading sessions…</p>}
        {list.error && <p role="alert">{list.error.message}</p>}
        {!list.loading && !list.error && !list.sessions.length && <p>No conversations yet.</p>}
        <ul className="audit-session-list">
          {list.sessions.map(({ id, userId, startedAt, language, turnCount, preview }) => (
            <li key={id}>
              <button
                className="secondary audit-session"
                type="button"
                data-testid="audit-session-row"
                aria-pressed={selected === id}
                onClick={() => setSelected(id)}
              >
                <strong>{userId ?? "anonymous"}</strong>
                <span>
                  <time dateTime={startedAt}>{dateFormat.format(new Date(startedAt))} UTC</time>
                  {" · "}
                  {language} · {turnCount} {turnCount === 1 ? "turn" : "turns"}
                </span>
                {preview && <small>{preview}</small>}
              </button>
            </li>
          ))}
        </ul>
        {list.hasMore && (
          <button
            className="secondary"
            type="button"
            data-testid="audit-load-more"
            onClick={list.loadMore}
            disabled={list.loading}
          >
            Load more
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="audit-history-title">
        <h2 id="audit-history-title">Event history</h2>
        {!selected && <p className="muted">Select a session to view its events.</p>}
        {detail.loading && <p role="status">Loading events…</p>}
        {detail.error && <p role="alert">{detail.error.message}</p>}
        {selected && detail.session?.id === selected && (
          <ol className="audit-timeline" data-testid="audit-timeline">
            {detail.events.map((event) => (
              <li key={event.id}>
                <time dateTime={event.ts}>{event.ts.slice(11, 19)} UTC</time>
                <div>
                  <EventContent event={event} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
