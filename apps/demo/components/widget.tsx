import { useSpeeq } from "@speeq/react";
import { type FormEvent, useEffect, useId, useState } from "react";
import type { LlmMode } from "../lib/llm";
import { ConfirmDialog } from "./confirm-dialog";
import { Transcript } from "./transcript";

const languageNames: Record<string, string> = {
  "en-IN": "English",
  "te-IN": "తెలుగు",
  "hi-IN": "हिन्दी",
};

/** Renders the assistant conversation and its voice, text and language controls. */
export function Widget({ llmMode }: { llmMode: LlmMode }) {
  const {
    state,
    language,
    languages,
    messages,
    interimTranscript,
    pendingConfirmation,
    error,
    support,
    sendText,
    startListening,
    stopListening,
    setLanguage,
    cancel,
    confirm,
  } = useSpeeq();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const panelId = useId();
  const titleId = useId();
  const listening = state === "listening";
  const canSend = !!text.trim() && state !== "thinking";

  useEffect(() => setReady(true), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setText("");
    void sendText(text.trim());
  }

  return (
    <aside className="assistant" aria-label="Vidya assistant">
      <button
        type="button"
        className="assistant-toggle"
        data-testid="assistant-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={!ready}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {open ? "Close Vidya" : "Ask Vidya"}
      </button>
      <section
        className="assistant-panel"
        id={panelId}
        aria-labelledby={titleId}
        hidden={!open}
        data-testid="assistant-panel"
      >
        <header className="assistant-header">
          <div>
            <h2 id={titleId}>Vidya</h2>
            <span data-testid="assistant-state" role="status">
              {state}
            </span>
          </div>
          {llmMode === "mock" && (
            <span className="assistant-badge" data-testid="assistant-mock-badge">
              Mock mode
            </span>
          )}
        </header>

        <Transcript messages={messages} interim={listening ? interimTranscript : ""} />

        <div className="assistant-controls">
          {error && <p role="alert">{error.message} Try sending your message again.</p>}
          <div className="assistant-toolbar">
            <button
              className="secondary assistant-mic"
              type="button"
              data-testid="assistant-mic"
              aria-label="Microphone"
              aria-pressed={listening}
              disabled={!support.speechInput}
              onClick={listening ? stopListening : startListening}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-3 0h6" />
              </svg>
            </button>
            <select
              aria-label="Language"
              data-testid="assistant-language"
              value={language}
              onChange={(event) => setLanguage(event.currentTarget.value)}
            >
              {languages.map((tag) => (
                <option key={tag} value={tag} lang={tag}>
                  {languageNames[tag] ?? tag}
                </option>
              ))}
            </select>
            {(state === "thinking" || state === "speaking") && (
              <button className="secondary" type="button" onClick={cancel}>
                Stop
              </button>
            )}
          </div>
          {!support.speechInput && (
            <small>Voice input isn't supported in this browser. Type instead.</small>
          )}
          {support.voiceForLanguage === false && (
            <small>No voice is installed for this language. Replies still appear as text.</small>
          )}
          <form className="assistant-compose" onSubmit={submit}>
            <input
              aria-label="Message"
              data-testid="assistant-input"
              placeholder="Ask Vidya"
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            <button type="submit" disabled={!canSend} data-testid="assistant-send">
              Send
            </button>
          </form>
        </div>
      </section>
      {pendingConfirmation && (
        <ConfirmDialog
          key={pendingConfirmation.confirmationId}
          pending={pendingConfirmation}
          confirm={confirm}
        />
      )}
    </aside>
  );
}
