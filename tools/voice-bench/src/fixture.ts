import { createServer } from "node:http";
import { createGeminiProvider } from "@speeq/llm-gemini";
import { createOpenAICompatibleProvider } from "@speeq/llm-openai-compatible";
import { createSpeeq, defineTool } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { z } from "zod";

const env = process.env;
const model = env.VOICE_BENCH_MODEL,
  key = env.VOICE_BENCH_API_KEY,
  token = env.VOICE_BENCH_AUDIT_TOKEN;
if (!model || !token) throw Error("Set VOICE_BENCH_MODEL and VOICE_BENCH_AUDIT_TOKEN.");
const llm =
  env.VOICE_BENCH_LLM === "gemini"
    ? createGeminiProvider({ model, apiKey: key ?? "" })
    : createOpenAICompatibleProvider({
        model,
        apiKey: key,
        baseURL:
          env.VOICE_BENCH_BASE_URL ??
          (env.VOICE_BENCH_LLM === "groq"
            ? "https://api.groq.com/openai/v1"
            : "http://localhost:8080/v1"),
      });
const definitions = {
  questions: z.object({ topic: z.string() }),
  orderStatus: z.object({ id: z.string().optional() }),
  track: z.object({ id: z.string().optional() }),
  eta: z.object({ id: z.string() }),
  products: z.object({ category: z.string(), maxPrice: z.number() }),
  revenue: z.object({ period: z.enum(["today", "last_week", "current", "last_month"]) }),
  cancelOrder: z.object({ id: z.string() }),
  saveQuestion: z.object({ id: z.string() }),
  reschedule: z.object({ id: z.string(), date: z.string() }),
};
const app = createSpeeq({
  llm,
  store: createMemoryStore({ quiet: true }),
  updateCheck: false,
  telemetry: { enabled: false },
  guardrails: { rateLimit: false },
  agent: {
    name: "Practice desk",
    instructions:
      "Help with education, orders, shipment tracking and revenue reports. Ask for clarification when the request is unclear. Use English canonical tool argument values. This is a synthetic evaluation.",
  },
  audit: { authorize: (r) => r.headers.get("authorization") === `Bearer ${token}` },
  routes: ["dashboard", "orders", "practice", "tracking"].map((id) => ({
    id,
    title: id,
    path: `/${id}`,
  })),
  tools: Object.entries(definitions).map(([name, input]) =>
    defineTool({
      name,
      description: name.replace(/([A-Z])/g, " $1"),
      risk: ["cancelOrder", "reschedule", "saveQuestion"].includes(name) ? "write" : "read",
      input,
      handler: () => ({ fixture: true }),
    }),
  ),
});
createServer(async (req, res) => {
  try {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) {
        res.writeHead(413).end();
        return;
      }
      parts.push(chunk);
    }
    const response = await app.handler(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: new Headers(
          Object.entries(req.headers).flatMap(([k, v]) =>
            typeof v === "string" ? [[k, v]] : [],
          ) as [string, string][],
        ),
        body: parts.length ? Buffer.concat(parts) : undefined,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500).end();
  }
}).listen(Number(env.PORT ?? 4313), "127.0.0.1");
