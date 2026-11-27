"use client";

import { SpeeqProvider } from "@speeq/react";
import { useRouter } from "next/navigation";
import { type JSX, useEffect } from "react";
import type { LlmMode } from "../lib/llm";
import { AssistantQuestionContext } from "./question-context";
import { UiActions } from "./ui-actions";
import { Widget } from "./widget";

const endpoint = "/api/speeq";
const sessionKey = `speeq:session:${endpoint}`;
const ownerKey = "vidya:session-owner";

/** Mounts the persistent assistant beside the server-rendered page content. */
export function Assistant({
  llmMode,
  viewerId,
}: {
  llmMode: LlmMode;
  viewerId?: string;
}): JSX.Element {
  const router = useRouter();
  const owner = viewerId ?? "anonymous";

  useEffect(() => {
    // Conversation tokens belong to the account that created them, including anonymous viewers.
    try {
      if (sessionStorage.getItem(ownerKey) !== owner) {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.setItem(ownerKey, owner);
      }
    } catch {
      // The client can still use an in-memory session when storage is unavailable.
    }
  }, [owner]);

  return (
    <SpeeqProvider
      key={owner}
      endpoint={endpoint}
      languages={["en-IN", "te-IN", "hi-IN"]}
      language="en-IN"
      persistSession="sessionStorage"
      onNavigate={(action) => router.push(action.href)}
    >
      <AssistantQuestionContext />
      <UiActions />
      <Widget llmMode={llmMode} />
    </SpeeqProvider>
  );
}
