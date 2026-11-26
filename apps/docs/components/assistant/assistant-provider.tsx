"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SpeeqProvider } from "speeq/react";
import { correctTranscript } from "../../lib/assistant/transcript";
import { AssistantWidget } from "./assistant-widget";

/** Turn the assistant's navigation into a router push, scrolling to a section when it names one. */
export function toLocalHref(href: string): string {
  const url = new URL(href, "http://local.invalid");
  const section = url.searchParams.get("section");
  url.searchParams.delete("section");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${section ? `#${section}` : url.hash}`;
}

/**
 * Puts the speeq assistant on every page. The provider lives in the root layout, so a call keeps
 * going while the visitor moves around the site.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <SpeeqProvider
      endpoint="/api/speeq"
      language="en-US"
      languages={["en-US"]}
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
  );
}
