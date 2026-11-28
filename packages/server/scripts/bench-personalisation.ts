/**
 * Personalised versus plain mode under the same conditions (release 0.12, spec section 44).
 * Mock model with no delay, in-memory store, in-process requests: it measures speeq's own overhead,
 * not network or model latency. A "visit" is one identity probe, one session and one turn. Run: `npx tsx scripts/bench-personalisation.ts` in packages/server.
 */
import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, jsonRequest, readSseEvents } from "@speeq/testing";
import { z } from "zod";
import { createSpeeq, defineContext, defineRoute } from "../src/index.js";

const N = Number(process.env.BENCH_N ?? 300);
type U = { id: string; profile?: { preferredName: string } };
let fetches = 0;

function build(personal: boolean) {
  const llm = new FakeLLMProvider(() => ({ text: "Sure, here you go." }));
  const routes = Array.from({ length: 20 }, (_, i) =>
    defineRoute({ id: `page${i}`, path: `/page-${i}`, title: `Page ${i}` }),
  );
  const speeq = createSpeeq<U>({
    secret: "bench-secret-bench-secret-bench-secret",
    agent: { name: "Seekh", instructions: "Help students prepare for GATE." },
    llm,
    store: createMemoryStore({ quiet: true }),
    logger: { error: () => undefined, warn: () => undefined },
    updateCheck: false,
    guardrails: { rateLimit: false },
    routes,
    ...(personal
      ? {
          resolveUser: (r: Request) =>
            r.headers.get("x-user") ? { id: "u1", profile: { preferredName: "Ravi" } } : null,
          allowAnonymous: true,
          identity: { expose: ["preferredName"] as "preferredName"[] },
          business: {
            name: "SwaSeekh",
            description: "GATE preparation with previous-year questions",
          },
          agent: {
            name: "Seekh",
            instructions: "Help students prepare for GATE.",
            style: { personality: "educational" as const },
          },
          greeting: { member: ["Welcome back, {name}! You have {enrollments.count} courses."] },
          memory: { mode: "preferences" as const },
          context: {
            page: { allow: ["questionId"] },
            providers: [
              defineContext({
                id: "enrollments",
                description: "Courses the student is enrolled in",
                category: "ownership",
                load: "initial",
                output: z.object({
                  count: z.number(),
                  courses: z.array(z.object({ title: z.string() })),
                }),
                expose: ["count", "courses[].title"],
                greeting: ["count"],
                fetch: () => {
                  fetches++;
                  return { count: 2, courses: [{ title: "Operating Systems" }, { title: "DBMS" }] };
                },
              }),
              defineContext({
                id: "bookmarks",
                description: "Saved questions",
                category: "activity",
                output: z.object({ items: z.array(z.string()) }),
                expose: ["items"],
                fetch: () => {
                  fetches++;
                  return { items: ["q1", "q2"] };
                },
              }),
            ],
          },
        }
      : {}),
  });
  return { speeq, llm };
}

const ms = (t: number) => Number((performance.now() - t).toFixed(3));
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { median: at(0.5).toFixed(2), p95: at(0.95).toFixed(2) };
}

async function run(personal: boolean) {
  const { speeq, llm } = build(personal);
  const headers = personal ? { "x-user": "u1" } : {};
  const identity: number[] = [];
  const session: number[] = [];
  const turn: number[] = [];
  const first: number[] = [];
  fetches = 0;
  const rss = process.memoryUsage().rss;
  for (let i = 0; i < N; i++) {
    let t = performance.now();
    await (
      await speeq.handler(
        new Request("http://localhost/api/speeq/identity?path=/page-1", { headers }),
      )
    ).text();
    identity.push(ms(t));
    t = performance.now();
    const s = (await (
      await speeq.handler(
        jsonRequest("/api/speeq/session", { body: { language: "en-IN" }, headers }),
      )
    ).json()) as { sessionId: string; sessionToken: string };
    session.push(ms(t));
    t = performance.now();
    const r = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: {
          text: "Explain this question",
          language: "en-IN",
          context: { path: "/page-1", title: "Q", data: { questionId: "q42" } },
        },
        token: s.sessionToken,
        headers,
      }),
    );
    const reader = r.body?.getReader();
    let firstAt = 0;
    if (reader) {
      const { value } = await reader.read();
      firstAt = ms(t);
      void value;
      for (;;) if ((await reader.read()).done) break;
    } else await readSseEvents(r);
    first.push(firstAt);
    turn.push(ms(t));
  }
  const prompt = String(llm.requests.at(-1)?.messages[0]?.content ?? "");
  return {
    mode: personal ? "personalised" : "plain",
    "identity probe ms": stats(identity),
    "session create ms": stats(session),
    "turn first byte ms": stats(first),
    "turn total ms": stats(turn),
    "system prompt chars": prompt.length,
    "≈ prompt tokens": Math.round(prompt.length / 4),
    "model calls per turn": Number((llm.requests.length / N).toFixed(2)),
    "context fetches per visit": Number((fetches / N).toFixed(2)),
    "rss growth MB": Number(((process.memoryUsage().rss - rss) / 1e6).toFixed(1)),
  };
}

const plain = await run(false);
const personal = await run(true);
console.log(
  `N=${N} per mode, Node ${process.versions.node}, mock model (no latency), in-memory store`,
);
for (const [k, v] of Object.entries(plain)) {
  if (k === "mode") continue;
  const p = (personal as Record<string, unknown>)[k];
  const f = (x: unknown) =>
    typeof x === "object" && x
      ? `${(x as { median: string }).median} (p95 ${(x as { p95: string }).p95})`
      : String(x);
  console.log(`${k.padEnd(26)} plain ${f(v).padEnd(22)} personalised ${f(p)}`);
}
