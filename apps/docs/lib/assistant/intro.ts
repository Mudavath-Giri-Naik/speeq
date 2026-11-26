/** The full list of what the guide can do. Used for the text answer to "what can you do?". */
export const INTRO =
  "I'm the speeq guide. I can open any page on this site, explain any part of the docs, and read out live install numbers. Just say what you want, and you can interrupt me any time.";

/** What the guide says when a call starts. Short on purpose, so the visitor can jump in at once. */
export const CALL_GREETING =
  "Hi, I'm the speeq guide. Ask me anything, or tell me where to go. You can interrupt me any time.";

export const LISTENING_AGAIN = "I'm listening.";

/** Greetings in the other languages the voice mode offers, keyed by base language. */
const GREETINGS: Record<string, { hello: string; again: string }> = {
  te: {
    hello: "నమస్కారం! నేను స్పీక్ గైడ్‌ను. ఏదైనా అడగండి, లేదా ఏ పేజీకి వెళ్లాలో చెప్పండి. మీరు ఎప్పుడైనా మధ్యలో మాట్లాడవచ్చు.",
    again: "చెప్పండి, వింటున్నాను.",
  },
  hi: {
    hello:
      "नमस्ते! मैं स्पीक गाइड हूँ। कुछ भी पूछिए, या बताइए कि किस पेज पर जाना है। आप कभी भी बीच में बोल सकते हैं।",
    again: "बोलिए, मैं सुन रहा हूँ।",
  },
};

/** The call greeting, or the short "I'm listening" line, in the visitor's language. */
export function greetingFor(language: string, again: boolean): string {
  const local = GREETINGS[language.split("-")[0] ?? ""];
  if (local) return again ? local.again : local.hello;
  return again ? LISTENING_AGAIN : CALL_GREETING;
}

export const SUGGESTIONS = [
  "What can you do?",
  "Open the quickstart",
  "How many installs does speeq have?",
  "Explain how confirmations work",
];
