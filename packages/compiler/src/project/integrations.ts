import type { Evidence } from "@speeq/core/manifest";
/** Product categories exposed to CLI clients. */
export type IntegrationCategory =
  | "auth"
  | "database"
  | "payment"
  | "llm"
  | "agent-framework"
  | "speech"
  | "storage"
  | "analytics"
  | "speeq";
/** An installed dependency and its declaration location. */
export interface DetectedIntegration {
  id: string;
  categories: IntegrationCategory[];
  package: string;
  versionRange: string;
  evidence: Evidence[];
}
/** Exact names precede scoped wildcard groups. */
export const INTEGRATION_TABLE: readonly {
  package: string | RegExp;
  id: string;
  categories: IntegrationCategory[];
}[] = [
  { package: "next-auth", id: "nextauth", categories: ["auth"] },
  { package: "@auth/core", id: "authjs", categories: ["auth"] },
  { package: "@clerk/nextjs", id: "clerk", categories: ["auth"] },
  { package: "firebase", id: "firebase", categories: ["auth", "database", "storage"] },
  { package: "firebase-admin", id: "firebase", categories: ["auth", "database", "storage"] },
  { package: "better-auth", id: "better-auth", categories: ["auth"] },
  { package: "@supabase/ssr", id: "supabase-auth", categories: ["auth"] },
  { package: "@supabase/auth-helpers-nextjs", id: "supabase-auth", categories: ["auth"] },
  { package: "@supabase/supabase-js", id: "supabase", categories: ["database", "auth", "storage"] },
  { package: "@kinde-oss/kinde-auth-nextjs", id: "kinde", categories: ["auth"] },
  { package: "mongodb", id: "mongodb", categories: ["database"] },
  { package: "mongoose", id: "mongodb", categories: ["database"] },
  { package: "@prisma/client", id: "prisma", categories: ["database"] },
  { package: "prisma", id: "prisma", categories: ["database"] },
  { package: "drizzle-orm", id: "drizzle", categories: ["database"] },
  { package: "pg", id: "postgres", categories: ["database"] },
  { package: "postgres", id: "postgres", categories: ["database"] },
  { package: "@neondatabase/serverless", id: "postgres", categories: ["database"] },
  { package: "@libsql/client", id: "libsql", categories: ["database"] },
  { package: "stripe", id: "stripe", categories: ["payment"] },
  { package: "@stripe/stripe-js", id: "stripe", categories: ["payment"] },
  { package: "razorpay", id: "razorpay", categories: ["payment"] },
  { package: "@paypal/react-paypal-js", id: "paypal", categories: ["payment"] },
  { package: "openai", id: "openai", categories: ["llm"] },
  { package: "@anthropic-ai/sdk", id: "anthropic", categories: ["llm"] },
  { package: "@google/generative-ai", id: "google-genai", categories: ["llm"] },
  { package: "@google/genai", id: "google-genai", categories: ["llm"] },
  { package: "groq-sdk", id: "groq", categories: ["llm"] },
  { package: "ollama", id: "ollama", categories: ["llm"] },
  { package: "ai", id: "vercel-ai-sdk", categories: ["llm", "agent-framework"] },
  { package: /^@ai-sdk\//, id: "vercel-ai-sdk", categories: ["llm", "agent-framework"] },
  { package: "@langchain/langgraph", id: "langgraph", categories: ["agent-framework"] },
  { package: "langchain", id: "langchain", categories: ["agent-framework", "llm"] },
  { package: /^@langchain\//, id: "langchain", categories: ["agent-framework", "llm"] },
  { package: "@google/adk", id: "google-adk", categories: ["agent-framework"] },
  { package: "@openai/agents", id: "openai-agents", categories: ["agent-framework"] },
  { package: "@aws-sdk/client-s3", id: "storage-service", categories: ["storage"] },
  { package: "@vercel/blob", id: "storage-service", categories: ["storage"] },
  { package: /^@uploadthing\//, id: "storage-service", categories: ["storage"] },
  { package: "cloudinary", id: "storage-service", categories: ["storage"] },
  { package: "posthog-js", id: "posthog", categories: ["analytics"] },
  { package: "posthog-node", id: "posthog", categories: ["analytics"] },
  { package: "@vercel/analytics", id: "vercel-analytics", categories: ["analytics"] },
  { package: "mixpanel-browser", id: "mixpanel", categories: ["analytics"] },
  { package: "@segment/analytics-next", id: "segment", categories: ["analytics"] },
  { package: "speeq", id: "speeq", categories: ["speeq"] },
  { package: /^@speeq\//, id: "speeq", categories: ["speeq"] },
];
/** Locate a literal dependency key without retaining source excerpts. */
export function dependencyEvidence(file: string, text: string, name: string): Evidence {
  return {
    file,
    line: Math.max(1, text.split("\n").findIndex((l) => l.includes(JSON.stringify(name))) + 1),
    detector: "package-dependency",
    note: "Declared package dependency",
  };
}
/** Match declared dependencies against the integration registry. */
export function integrations(
  deps: Record<string, string>,
  file: string,
  text: string,
): DetectedIntegration[] {
  return Object.entries(deps)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, versionRange]) => {
      const row = INTEGRATION_TABLE.find((r) =>
        typeof r.package === "string" ? r.package === name : r.package.test(name),
      );
      return row
        ? [
            {
              id: row.id,
              categories: row.categories,
              package: name,
              versionRange,
              evidence: [dependencyEvidence(file, text, name)],
            },
          ]
        : [];
    });
}
