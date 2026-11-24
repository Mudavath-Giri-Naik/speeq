import type { ChatMessage } from "@speeq/react";
import { useEffect, useRef } from "react";

/** Renders finalized, streaming and interrupted messages in conversation order. */
export function Transcript({ messages, interim }: { messages: ChatMessage[]; interim: string }) {
  const log = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: New transcript content moves the view.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, interim]);

  return (
    <div
      className="assistant-transcript"
      data-testid="assistant-transcript"
      ref={log}
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {messages.length === 0 && !interim && <p className="muted">What would you like to study?</p>}
      {messages.map(({ id, role, status, text }) => (
        <div
          key={id}
          className={`assistant-message assistant-message-${role}`}
          data-status={status}
        >
          <strong>{role === "user" ? "You" : "Vidya"}</strong>
          <p>{text}</p>
          {status === "streaming" && <small>Replying…</small>}
          {status === "interrupted" && <small>Interrupted</small>}
          {status === "error" && <small>Reply failed</small>}
        </div>
      ))}
      {interim && <p className="muted">{interim}</p>}
    </div>
  );
}
