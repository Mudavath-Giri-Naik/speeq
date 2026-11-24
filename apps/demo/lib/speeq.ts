import { MongoClient } from "mongodb";
import { getLlmMode } from "./llm";
import {
  createDemoSpeeq,
  type DemoSpeeqOptions,
  demoMemoryStore,
  demoMongoStore,
} from "./speeq-config";

type DemoState = {
  mongo?: MongoClient;
  store?: DemoSpeeqOptions["store"];
  bookmarks: Map<string, Set<number>>;
};
const global = globalThis as typeof globalThis & { speeqDemo?: DemoState };
let instance: ReturnType<typeof createDemoSpeeq> | undefined;

/** The configured mode, available before the first conversation starts. */
export const llmMode = getLlmMode(process.env);

/** Initializes speeq on demand and preserves demo data across development reloads. */
export function getDemoSpeeq(waitUntil: NonNullable<DemoSpeeqOptions["waitUntil"]>) {
  if (instance) return instance.speeq;
  const env = process.env;
  global.speeqDemo ??= { bookmarks: new Map() };
  const state = global.speeqDemo;
  const uri = env.MONGODB_URI?.trim();
  if (!state.store) {
    if (uri) {
      state.mongo ??= new MongoClient(uri);
      state.store = demoMongoStore(state.mongo, env.MONGODB_DB?.trim() || "speeq_demo");
    } else {
      state.store = demoMemoryStore();
    }
  }
  instance = createDemoSpeeq({ env, store: state.store, bookmarks: state.bookmarks, waitUntil });
  console.info(`[demo] LLM mode: ${instance.llmMode}`);
  return instance.speeq;
}
