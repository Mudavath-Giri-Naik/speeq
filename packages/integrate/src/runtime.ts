import type { AgentContext, LLMMessage } from "@speeq/core";
import {
  createSpeeq,
  type FormFillAction,
  protectedReason,
  type RouteDefinition,
  type ToolDefinition,
} from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { assistantText, FakeLLMProvider, startSession } from "@speeq/testing";
import * as zod from "zod";
import type { FormSpec, ToolSpec } from "./render.js";
import { type HostCall, loadGenerated } from "./sandbox.js";
import type { Check } from "./verify.js";

type AnyTool = ToolDefinition<zod.ZodType, { id: string; roles?: string[] }>;

/** A small value that satisfies a JSON Schema, or `undefined` when none is obvious. */
export function sample(schema: unknown, depth = 0): unknown {
  if (!schema || typeof schema !== "object" || depth > 6) return undefined;
  const s = schema as Record<string, unknown>;
  if ("const" in s) return s.const;
  if (Array.isArray(s.enum)) return s.enum[0];
  const pick = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]) : undefined);
  const alt = pick("anyOf") ?? pick("oneOf");
  if (alt)
    return sample(alt.find((a) => (a as { type?: unknown }).type !== "null") ?? alt[0], depth + 1);
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  switch (type) {
    case "string": {
      const f = s.format;
      if (f === "email") return "user@example.com";
      if (f === "uuid") return "00000000-0000-4000-8000-000000000000";
      if (f === "date-time") return "2026-01-01T00:00:00.000Z";
      if (f === "date") return "2026-01-01";
      if (f === "uri" || f === "url") return "https://example.com/";
      return "x".repeat(Math.max(1, Number(s.minLength ?? 1)));
    }
    case "integer":
    case "number": {
      const min = typeof s.minimum === "number" ? s.minimum : undefined;
      const exMin = typeof s.exclusiveMinimum === "number" ? s.exclusiveMinimum + 1 : undefined;
      return exMin ?? min ?? 1;
    }
    case "boolean":
      return true;
    case "array": {
      const n = Number(s.minItems ?? 0);
      const item = sample(s.items, depth + 1);
      return n > 0 && item !== undefined ? Array.from({ length: n }, () => item) : [];
    }
    case "object": {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const req = Array.isArray(s.required) ? (s.required as string[]) : [];
      const out: Record<string, unknown> = {};
      for (const k of req) {
        const v = sample(props[k], depth + 1);
        if (v === undefined) return undefined;
        out[k] = v;
      }
      return out;
    }
    default:
      return undefined;
  }
}
const code = (e: unknown) => (e as { code?: string } | null)?.code ?? "error";
const ctxFor = (user: AgentContext<{ id: string }>["user"]) =>
  ({
    user,
    session: { id: "verify" },
    request: new Request("http://localhost/"),
    signal: new AbortController().signal,
    language: "en-IN",
    pageContext: undefined,
  }) as unknown as AgentContext<{ id: string }>;

/** Runtime level: the generated files, run against a mock model. No host code runs. */
export async function runtimeChecks(input: {
  tools: string | undefined;
  routes: string | undefined;
  /** `ui.ts` when owned, else `undefined`. */
  ui?: string | undefined;
  forms?: readonly FormSpec[];
  specs: readonly ToolSpec[];
}): Promise<Check[]> {
  const out: Check[] = [];
  const add = (id: string, status: Check["status"], title: string, detail?: string, fix?: string) =>
    out.push({
      id,
      level: "runtime",
      status,
      title,
      ...(detail ? { detail } : {}),
      ...(fix ? { fix } : {}),
    });
  const skipAll = (why: string) => {
    for (const [id, t] of RUNTIME_TITLES)
      if (!out.some((c) => c.id === id)) add(id, "skip", t, why);
    return out;
  };
  if (input.tools === undefined || input.routes === undefined)
    return skipAll("A generated file is edited, missing or not owned by speeq, so it is not run.");
  let toolsMod: ReturnType<typeof loadGenerated>;
  let routes: RouteDefinition[];
  try {
    toolsMod = loadGenerated(input.tools);
    routes = loadGenerated(input.routes).exports.routes as RouteDefinition[];
    if (!Array.isArray(toolsMod.exports.tools) || !Array.isArray(routes))
      throw new Error("The generated files do not export `tools` and `routes`.");
  } catch (e) {
    add("R1", "fail", "Generated tools and routes load", e instanceof Error ? e.message : "failed");
    return skipAll("The generated files did not load.");
  }
  const tools = toolsMod.exports.tools as AnyTool[];
  add(
    "R1",
    "pass",
    "Generated tools and routes load",
    `${tools.length} tools, ${routes.length} routes`,
  );
  const calls: HostCall[] = toolsMod.calls;
  const roles = [...new Set(input.specs.flatMap((s) => s.auth?.roles ?? []))];
  let script: (m: LLMMessage[]) => {
    text?: string;
    toolCalls?: { name: string; arguments: unknown }[];
  } = () => ({
    text: "Hello from the mock model.",
  });
  const llm = new FakeLLMProvider((req) => script(req.messages) as never);
  let built: ReturnType<typeof createSpeeq>;
  try {
    built = createSpeeq({
      secret: "speeq-verify-secret-".padEnd(40, "x"),
      agent: { name: "Verify", instructions: "Verification run." },
      llm,
      store: createMemoryStore(),
      resolveUser: () => ({ id: "verify-user", roles }),
      allowAnonymous: false,
      routes,
      tools,
      updateCheck: false,
      logger: { error() {}, warn() {} },
    });
    add("R2", "pass", "The speeq server accepts the generated tools and routes");
  } catch (e) {
    add(
      "R2",
      "fail",
      "The speeq server accepts the generated tools and routes",
      e instanceof Error ? e.message : "failed",
    );
    return skipAll("The server did not start.");
  }
  const handler = built.handler;
  try {
    const s = await startSession(handler);
    const events = await s.turn("hello");
    const ok = /Hello from the mock model/.test(assistantText(events));
    add(
      "R3",
      ok ? "pass" : "fail",
      "A mock conversation gets an answer",
      ok ? undefined : "No assistant message.",
    );
  } catch (e) {
    add(
      "R3",
      "fail",
      "A mock conversation gets an answer",
      e instanceof Error ? e.message : "failed",
    );
  }

  // R4 confirmation: definition for every write tool, end to end where an input can be built.
  const byName = new Map(tools.map((t) => [t.name, t]));
  const bad: string[] = [];
  const unchecked: string[] = [];
  for (const spec of input.specs.filter((s) => s.write && !s.noConfirm)) {
    const def = byName.get(spec.name);
    if (!def || def.risk !== "write" || def.requiresConfirmation === false) {
      bad.push(`${spec.name} (definition)`);
      continue;
    }
    const args = sample(zod.toJSONSchema(def.input));
    if (args === undefined || !def.input.safeParse(args).success) {
      unchecked.push(spec.name);
      continue;
    }
    script = (msgs) =>
      msgs.some((m) => m.role === "tool")
        ? { text: "Done." }
        : { toolCalls: [{ name: spec.name, arguments: args }] };
    try {
      const base = calls.length;
      const denied = await startSession(handler);
      const ask = (await denied.turn(`run ${spec.name}`)).find(
        (e) => e.type === "confirmation.required",
      );
      if (!ask || ask.type !== "confirmation.required" || calls.length !== base) {
        bad.push(`${spec.name} (ran or did not ask before approval)`);
        continue;
      }
      await denied.confirm(ask.confirmationId, false);
      if (calls.length !== base) {
        bad.push(`${spec.name} (ran after denial)`);
        continue;
      }
      const yes = await startSession(handler);
      const ask2 = (await yes.turn(`run ${spec.name}`)).find(
        (e) => e.type === "confirmation.required",
      );
      if (!ask2 || ask2.type !== "confirmation.required") {
        bad.push(`${spec.name} (no second confirmation)`);
        continue;
      }
      await yes.confirm(ask2.confirmationId, true);
      if (calls.length !== base + 1) bad.push(`${spec.name} (did not run once after approval)`);
    } catch (e) {
      bad.push(`${spec.name} (${e instanceof Error ? e.message : "failed"})`);
    }
  }
  const writes = input.specs.filter((s) => s.write && !s.noConfirm).length;
  add(
    "R4",
    bad.length ? "fail" : "pass",
    "Write tools ask first, do not run before approval or after denial",
    bad.length
      ? bad.join("; ")
      : `${writes} write tools${unchecked.length ? `; definition only (no sample input): ${unchecked.join(", ")}` : ""}`,
  );

  // R5 permissions: call each handler directly as anonymous, wrong role and right role.
  const wrong: string[] = [];
  for (const spec of input.specs) {
    const def = byName.get(spec.name);
    if (!def) {
      wrong.push(`${spec.name} (missing)`);
      continue;
    }
    const attempt = async (user: { id: string; roles?: string[] } | null) => {
      const before = calls.length;
      try {
        await def.handler({} as never, ctxFor(user));
        return { ran: calls.length === before + 1, code: "" };
      } catch (e) {
        return { ran: calls.length !== before, code: code(e) };
      }
    };
    const anon = await attempt(null);
    if (!spec.auth) {
      if (!anon.ran) wrong.push(`${spec.name} (public tool blocked)`);
      continue;
    }
    if (anon.ran || anon.code !== "UNAUTHENTICATED")
      wrong.push(`${spec.name} (anonymous not blocked)`);
    if (spec.auth.roles) {
      const no = await attempt({ id: "u", roles: ["__none__"] });
      if (no.ran || no.code !== "FORBIDDEN") wrong.push(`${spec.name} (wrong role not blocked)`);
      const yes = await attempt({ id: "u", roles: [spec.auth.roles[0] as string] });
      if (!yes.ran) wrong.push(`${spec.name} (right role blocked)`);
    } else if (!(await attempt({ id: "u" })).ran)
      wrong.push(`${spec.name} (signed-in user blocked)`);
  }
  add(
    "R5",
    wrong.length ? "fail" : "pass",
    "Auth guards block anonymous and wrong-role users",
    wrong.length ? wrong.join("; ") : `${input.specs.length} tools checked`,
  );
  try {
    const res = await handler(new Request("http://localhost/api/speeq/audit/sessions"));
    add(
      "R6",
      res.status === 404 ? "pass" : "fail",
      "Audit routes return 404 without `authorize`",
      `status ${res.status}`,
    );
  } catch (e) {
    add(
      "R6",
      "fail",
      "Audit routes return 404 without `authorize`",
      e instanceof Error ? e.message : "failed",
    );
  }
  const open = input.specs.filter((s) => s.write && s.noConfirm).map((s) => s.name);
  add(
    "R7",
    open.length ? "warn" : "pass",
    "No write tool has confirmation turned off",
    open.length ? `Confirmation is disabled by your decision for: ${open.join(", ")}` : undefined,
  );
  const forms = input.forms ?? [];
  if (forms.length) {
    if (input.ui === undefined)
      add(
        "R8",
        "skip",
        FORM_TITLE,
        "ui.ts is edited, missing or not owned by speeq, so it is not run.",
      );
    else {
      const problems: string[] = [];
      try {
        const actions = loadGenerated(input.ui).exports.uiActions as FormFillAction[];
        for (const spec of forms) {
          const action = actions.find((a) => a.form?.id === spec.id);
          if (!action) {
            problems.push(`${spec.id} (missing)`);
            continue;
          }
          const accepts = (values: Record<string, unknown>) =>
            action.input.safeParse({ values }).success;
          if (accepts({ __speeq_probe__: "x" }))
            problems.push(`${spec.id} (accepts unknown fields)`);
          for (const f of spec.fields) {
            if (protectedReason(f) && accepts({ [f.name]: "x" }))
              problems.push(`${spec.id} (accepts protected field ${f.name})`);
          }
          if (action.risk !== "read" || action.confirm !== false)
            problems.push(`${spec.id} (not a draft-only action)`);
        }
      } catch (e) {
        problems.push(e instanceof Error ? e.message : "ui.ts did not load");
      }
      add(
        "R8",
        problems.length ? "fail" : "pass",
        FORM_TITLE,
        problems.length ? problems.join("; ") : `${forms.length} forms checked`,
        problems.length ? "Run `speeq upgrade` to regenerate .speeq/generated/ui.ts." : undefined,
      );
    }
  }
  return out;
}
const FORM_TITLE = "Form fill actions refuse protected and unknown fields";
const RUNTIME_TITLES: [string, string][] = [
  ["R1", "Generated tools and routes load"],
  ["R2", "The speeq server accepts the generated tools and routes"],
  ["R3", "A mock conversation gets an answer"],
  ["R4", "Write tools ask first, do not run before approval or after denial"],
  ["R5", "Auth guards block anonymous and wrong-role users"],
  ["R6", "Audit routes return 404 without `authorize`"],
  ["R7", "No write tool has confirmation turned off"],
];
