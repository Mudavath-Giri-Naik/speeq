import { isDeepStrictEqual } from "node:util";
import { SessionDetailResponseSchema } from "@speeq/core";
import { z } from "zod";
/** Reference intents, arguments and safe outcomes for a language corpus. */
export const IntentCases = z.object({
  review: z.string(),
  cases: z
    .array(
      z.object({
        id: z.string(),
        language: z.string(),
        replyLanguage: z.string(),
        text: z.string(),
        expected: z.object({
          tool: z.string().optional(),
          args: z.record(z.string(), z.unknown()).optional(),
          route: z.string().optional(),
          action: z.enum(["clarify", "confirm"]).optional(),
        }),
      }),
    )
    .min(1),
});
type Case = z.infer<typeof IntentCases>["cases"][number];
/** Score a fresh session from its authenticated audit evidence. Never approve a write. */
export async function evaluateIntent(c: Case, server: string, fetcher = fetch) {
  const endpoint = server.replace(/\/+$/, "");
  async function call(path: string, body?: unknown, token?: string) {
    const response = await fetcher(endpoint + path, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw Error(`Intent fixture HTTP ${response.status}`);
    return response;
  }
  const session = await (await call("/session", { language: c.replyLanguage })).json();
  const inputLanguage = c.language.split("+")[0];
  const prefix = `/session/${encodeURIComponent(session.sessionId)}`;
  const res = await call(
    `${prefix}/turn`,
    { text: c.text, language: c.replyLanguage, inputLanguage, inputMode: "voice" },
    session.sessionToken,
  );
  await res.text();
  const { events } = SessionDetailResponseSchema.parse(
    await (
      await call(
        `/audit/sessions/${encodeURIComponent(session.sessionId)}`,
        undefined,
        process.env.VOICE_BENCH_AUDIT_TOKEN,
      )
    ).json(),
  );
  const calls = events.flatMap((e) =>
    e.type === "tool.called"
      ? [{ name: e.data.name, args: e.data.args }]
      : e.type === "confirmation.requested"
        ? [{ name: e.data.toolName, args: e.data.args }]
        : [],
  );
  const confirmation = events.some((e) => e.type === "confirmation.requested");
  const clarified =
    events.some((e) => e.type === "assistant.message" && /[?？]/u.test(e.data.text)) ||
    events.some(
      (e) => e.type === "tool.called" && String(e.data.result).includes("needs_clarification"),
    );
  const wrote = events.some(
    (e) =>
      e.type === "tool.called" &&
      e.data.ok &&
      ["cancelOrder", "reschedule", "saveQuestion"].includes(e.data.name),
  );
  const { tool, args, route, action } = c.expected;
  const expectedTools = [...(tool ? [tool] : []), ...(route ? ["navigate"] : [])].sort();
  const actual = [...new Set(calls.map((x) => x.name))].sort();
  return {
    id: c.id,
    language: c.language,
    pair: `${c.language} → ${c.replyLanguage}`,
    tool: isDeepStrictEqual(expectedTools, actual),
    args: args ? calls.some((x) => x.name === tool && isDeepStrictEqual(x.args, args)) : null,
    navigation: route
      ? events.some((e) => e.type === "navigation" && e.data.routeId === route)
      : null,
    clarified,
    safe:
      !wrote &&
      (action === "confirm" ? confirmation || clarified : action === "clarify" ? clarified : true),
  };
}
/** Aggregate each language and each input/reply pair independently. */
export function summarizeIntent(rows: Awaited<ReturnType<typeof evaluateIntent>>[]) {
  function group(key: "language" | "pair") {
    return Object.fromEntries(
      [...new Set(rows.map((r) => r[key]))].map((k) => {
        const items = rows.filter((r) => r[key] === k);
        function mean(metric: "tool" | "args" | "navigation" | "clarified" | "safe") {
          const measured = items.map((r) => r[metric]).filter((v) => v !== null);
          return measured.length ? measured.filter(Boolean).length / measured.length : null;
        }
        return [
          k,
          {
            count: items.length,
            toolAccuracy: mean("tool"),
            argumentAccuracy: mean("args"),
            navigationAccuracy: mean("navigation"),
            clarificationRate: mean("clarified"),
            safeActionRate: mean("safe"),
          },
        ];
      }),
    );
  }
  return { byLanguage: group("language"), byPair: group("pair") };
}
