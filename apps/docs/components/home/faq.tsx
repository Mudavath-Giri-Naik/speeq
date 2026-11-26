import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BlurFade } from "@/components/ui/blur-fade";
import { Section, SectionHead } from "./kit";

export const FAQS: Array<[string, string]> = [
  [
    "Is speeq a chatbot?",
    "No. speeq is a headless interaction framework that connects natural-language conversation to application navigation, context, tools and the business functionality you approve. You control the interface.",
  ],
  [
    "Does speeq need direct access to my database?",
    "No. speeq works through your existing backend services and the tools you define. You decide which functionality and data are available. Conversations are stored in a store you choose.",
  ],
  [
    "Do I need a vector database or RAG system?",
    "No. The assistant can fetch current information through your existing services. Knowledge retrieval is optional, and you add it only if you want it.",
  ],
  [
    "Can I use my own AI model?",
    "Yes. There is an adapter for Groq and any OpenAI-compatible service, an adapter for Google Gemini, and you can write your own provider. Model names come from your configuration.",
  ],
  [
    "Is speeq free?",
    "speeq is MIT-licensed open-source software. Model providers, hosting and infrastructure are separate and may have their own costs.",
  ],
  [
    "Can I customize the assistant interface?",
    "Yes. speeq ships no design. You build the buttons, the chat window and the voice controls with the React hooks or the plain browser client.",
  ],
  [
    "Does speeq support multiple languages?",
    "Text works in the languages your model supports. Voice uses your browser by default; Telugu and Hindi voice use the server speech provider you configure. Recognition quality and voice availability depend on the provider and the device.",
  ],
  [
    "Can speeq perform real business actions?",
    "Yes, through the tools you write. Inputs are validated, your own permission checks run, and tools that change data need the visitor’s confirmation first.",
  ],
  [
    "Can speeq automatically discover my application?",
    "Not yet. Today you define tools and routes yourself, or let a coding agent set them up from the setup prompt. Automatic discovery is on the roadmap.",
  ],
  [
    "Does speeq provide business analytics?",
    "Today you get a full audit log of messages, tool calls and approvals, and optional anonymous usage counters on a dashboard you run. Intent analytics, journeys and conversion insight are planned.",
  ],
  [
    "Can I integrate speeq using Claude Code or Cursor?",
    "Yes. There is a copy-and-paste setup prompt that works in Claude Code, Codex and Cursor. A dedicated MCP server is planned but not available yet.",
  ],
  [
    "Will speeq replace my existing frontend?",
    "No. It adds an interaction layer to what you already have. Your pages, filters and forms stay, and your visitors can keep using them.",
  ],
];

/** Questions people ask first. The same text is also written into the page for search engines. */
export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return (
    <Section id="faq">
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(jsonLd)}
      </script>
      <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
        <SectionHead
          id="faq"
          eyebrow="FAQ"
          title="Questions, answered plainly."
          lede="Short, accurate answers. The documentation has the detail."
        />
        <BlurFade inView>
          <Accordion
            type="single"
            collapsible
            className="divide-y divide-line rounded-xl border border-line bg-elev px-4 sm:px-5"
          >
            {FAQS.map(([q, a], i) => (
              <AccordionItem key={q} value={`q${i}`} className="border-0">
                <AccordionTrigger className="py-4 text-left text-[0.95rem] font-medium text-fg hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-[0.9rem] leading-relaxed text-muted">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </BlurFade>
      </div>
    </Section>
  );
}
