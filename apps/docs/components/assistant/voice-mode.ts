"use client";
import { createContext, useContext } from "react";

/** How the visitor talks to the guide. "browser" is the default live-words English voice. */
export type VoiceMode = "browser" | "auto" | "en-US" | "te-IN" | "hi-IN";
export const VOICE_MODES: VoiceMode[] = ["browser", "auto", "en-US", "te-IN", "hi-IN"];
export const ModeContext = createContext<{ mode: VoiceMode; setMode: (m: VoiceMode) => void }>({
  mode: "browser",
  setMode: () => {},
});
export const useVoiceMode = () => useContext(ModeContext);
