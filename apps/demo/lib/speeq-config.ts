import { createSpeeq, defineKnowledgeSource, type Speeq, type SpeeqConfig } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { createMongoStore } from "@speeq/store-mongodb";
import { MongoClient } from "mongodb";
import { repo } from "./data/repository";
import { createDemoUserReader, type DemoUser, readDemoUser } from "./demo-auth";
import { type LlmMode, selectLlm } from "./llm";
import { routes } from "./routes";
import { createDemoTools } from "./tools";
import { uiActions } from "./ui-actions";

/** Supplies explicit configuration and optional state for the demo handler. */
export interface DemoSpeeqOptions {
  env: Record<string, string | undefined>;
  waitUntil?: (p: Promise<unknown>) => void;
  mockDelayMs?: number;
  store?: SpeeqConfig["store"];
  bookmarks?: Map<string, Set<number>>;
}

/** Makes an in-memory store with the demo's restart warning. */
export function demoMemoryStore() {
  console.warn("[demo] in-memory store: conversations reset on restart");
  return createMemoryStore({ quiet: true });
}

/** Shares a lazy Mongo connection and permits retries after failed initial connections. */
export function demoMongoStore(client: MongoClient, database: string) {
  let connection: Promise<MongoClient> | undefined;
  return createMongoStore({
    db: async () => {
      connection ??= client.connect().catch((error) => {
        connection = undefined;
        throw error;
      });
      return (await connection).db(database);
    },
  });
}

const questions = defineKnowledgeSource<DemoUser>({
  id: "questions",
  description: "Search the study catalogue for topic summaries and practice questions.",
  search: async (query) => repo.search(query, 5),
});

/** Creates a demo handler using only the supplied app configuration. */
export function createDemoSpeeq({
  env,
  waitUntil,
  mockDelayMs = 15,
  store,
  bookmarks = new Map(),
}: DemoSpeeqOptions): { speeq: Speeq; llmMode: LlmMode } {
  const { provider, mode } = selectLlm(env, mockDelayMs);
  const uri = env.MONGODB_URI?.trim();
  const resolveUser = env === process.env ? readDemoUser : createDemoUserReader(env);
  const speeq = createSpeeq<DemoUser>({
    secret: env.SPEEQ_SECRET,
    projectKey: env.SPEEQ_PROJECT_KEY,
    agent: {
      name: "Vidya",
      instructions:
        "Help students practise exam topics and navigate the study site. Use the catalogue tools for facts and counts.",
      languages: ["en-IN", "te-IN", "hi-IN"],
    },
    llm: provider,
    store:
      store ??
      (uri
        ? demoMongoStore(new MongoClient(uri), env.MONGODB_DB?.trim() || "speeq_demo")
        : demoMemoryStore()),
    resolveUser,
    allowAnonymous: true,
    audit: {
      authorize: async (request) => (await resolveUser(request))?.role === "admin",
      retentionDays: 30,
    },
    routes,
    tools: createDemoTools(repo, bookmarks),
    uiActions,
    knowledge: [questions],
    waitUntil,
    // Provider and driver errors can carry connection details. Keep those out of application logs.
    logger: {
      warn: (message) => console.warn("[speeq]", message),
      error: (message) => console.error("[speeq]", message),
    },
  });
  return { speeq, llmMode: mode };
}
