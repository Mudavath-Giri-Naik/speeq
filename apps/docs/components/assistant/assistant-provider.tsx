"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SpeeqProvider } from "speeq/react";
import { correctTranscript } from "../../lib/assistant/transcript";
import { siteVocabulary } from "../../lib/assistant/vocabulary";
import { AssistantWidget } from "./assistant-widget";
import { ModeContext, VOICE_MODES, type VoiceMode } from "./voice-mode";

/** Turn the assistant's navigation into a router push, scrolling to a section when it names one. */
export function toLocalHref(href: string): string {
  const url = new URL(href, "http://local.invalid");
  const section = url.searchParams.get("section");
  url.searchParams.delete("section");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${section ? `#${section}` : url.hash}`;
}

const KEY = "speeq-voice-mode";

/**
 * Puts the speeq assistant on every page. The provider lives in the root layout, so a call keeps
 * going while the visitor moves around the site.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mode, setModeState] = useState<VoiceMode>("browser");
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) as VoiceMode | null;
    if (saved && VOICE_MODES.includes(saved)) setModeState(saved);
  }, []);
  const setMode = useCallback((m: VoiceMode) => {
    window.localStorage.setItem(KEY, m);
    setModeState(m);
  }, []);
  const server = mode !== "browser";
  const language = mode === "te-IN" || mode === "hi-IN" ? mode : "en-US";
  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      <SpeeqProvider
        key={mode}
        endpoint="/api/speeq"
        language={language}
        languages={server ? ["en-US", "te-IN", "hi-IN"] : ["en-US"]}
        {...(server
          ? {
              voice: { input: "server" as const, output: "browser" as const },
              languageMode: mode === "auto" ? ("auto" as const) : ("fixed" as const),
              preferredLanguages: ["en-US", "te-IN", "hi-IN"],
              vocabulary: siteVocabulary,
            }
          : {})}
        speakReplies={false}
        persistSession="sessionStorage"
        call={{
          interruptGraceMs: 1000,
          commitAfterMs: 700,
          echoGuard: true,
          voiceDetection: true,
          correct: correctTranscript,
        }}
        onNavigate={({ href }) => router.push(toLocalHref(href))}
        getContext={() => ({
          path: window.location.pathname,
          title: document.title,
          data: { site: "speeq documentation" },
        })}
      >
        {children}
        <AssistantWidget />
      </SpeeqProvider>
    </ModeContext.Provider>
  );
}
