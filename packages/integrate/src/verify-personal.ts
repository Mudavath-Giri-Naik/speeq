import type { ConversationStore } from "@speeq/core";
import { createSpeeq, type SpeeqConfig } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, jsonRequest, readSseEvents } from "@speeq/testing";
import { agentWiring, settingsPaths } from "./agent-settings.js";
import type { ProjectFs } from "./fsx.js";
import { ownership } from "./owned.js";
import type { Setup } from "./setup.js";
import type { Check } from "./verify.js";

/*
 * Personalisation checks for `speeq verify` and `speeq doctor` (release 0.12, task 028). Static checks
 * read files only. Runtime checks run the SDK with the app's own settings, a mock model, an
 * in-memory store and a test resolver: never the app's sign-in code, endpoints or database.
 */

const check = (
  id: string,
  level: Check["level"],
  status: Check["status"],
  title: string,
  detail?: string,
  fix?: string,
): Check => ({
  id,
  level,
  status,
  title,
  ...(detail ? { detail } : {}),
  ...(fix ? { fix } : {}),
});

/** Static checks of the control-center settings. Nothing runs. */
export async function personalStaticChecks(i: {
  fs: ProjectFs;
  prefix: string;
  setup: Setup | undefined;
  /** Names set in env files or the process (values are never read). */
  envHas: (name: string) => boolean;
}): Promise<Check[]> {
  const { fs, prefix, setup } = i;
  const out: Check[] = [];
  const p = settingsPaths(prefix);
  const agent = await fs.read(p.agent);
  const config = await fs.read(p.config);
  const hasSettings = agent !== undefined;
  if (!hasSettings) {
    out.push(
      check(
        "P1",
        "static",
        "skip",
        "Agent settings are wired",
        "No settings saved from `speeq setup` yet (0.11 behaviour).",
      ),
    );
  } else {
    const own = ownership(agent);
    const wired = config === undefined ? "unknown" : agentWiring(config);
    out.push(
      own === "edited"
        ? check(
            "P1",
            "static",
            "warn",
            "Agent settings are wired",
            `${p.agent} was edited by hand; the next save asks before overwriting it.`,
            "Change settings with `npx speeq setup`, or delete its first line to take it over.",
          )
        : wired === "wired"
          ? check(
              "P1",
              "static",
              "pass",
              "Agent settings are wired",
              `${p.config} spreads agentSettings`,
            )
          : check(
              "P1",
              "static",
              "fail",
              "Agent settings are wired",
              `${p.config} does not use ${p.agent}, so the terminal settings have no effect.`,
              "Run `npx speeq setup` and Save, or add `...agentSettings,` and `agent: agentProfile` by hand.",
            ),
    );
  }
  const binding = setup?.identity?.binding;
  const identity = await fs.read(p.identity);
  if (binding) {
    const target = binding.kind === "clerk" ? undefined : `${prefix}${binding.file}`;
    const targetText = target ? await fs.read(target) : "";
    if (identity === undefined || ownership(identity) === "foreign")
      out.push(
        check(
          "P2",
          "static",
          "fail",
          "Sign-in binding",
          `${p.identity} is missing.`,
          "Open `npx speeq setup auth` and Save.",
        ),
      );
    else if (targetText === undefined)
      out.push(
        check(
          "P2",
          "static",
          "fail",
          "Sign-in binding",
          `${target} no longer exists, so resolveUser cannot import it.`,
          "Bind sign-in again in `npx speeq setup auth`.",
        ),
      );
    else if (
      binding.kind !== "clerk" &&
      !new RegExp(`\\b${binding.exportName}\\b`).test(targetText ?? "")
    )
      out.push(
        check(
          "P2",
          "static",
          "fail",
          "Sign-in binding",
          `${target} does not mention ${binding.exportName} any more.`,
          "Bind sign-in again in `npx speeq setup auth`.",
        ),
      );
    else
      out.push(
        check(
          "P2",
          "static",
          "pass",
          "Sign-in binding",
          `${setup?.identity?.provider ?? binding.kind} → resolveUser (${setup?.identity?.status === "verified" ? "verified" : "generated; runtime identity checks below use a test user, not your sign-in"})`,
        ),
      );
  } else
    out.push(
      check("P2", "static", "skip", "Sign-in binding", "No sign-in bound: everyone is a guest."),
    );
  const mode = setup?.memory?.mode ?? "session";
  const store = setup?.store?.kind ?? "memory";
  if (mode === "session")
    out.push(
      check("P3", "static", "skip", "Cross-session memory", "Off: each visit starts fresh."),
    );
  else if (!binding)
    out.push(
      check(
        "P3",
        "static",
        "warn",
        "Cross-session memory",
        `memory.mode is ${mode}, but no sign-in is bound, so nothing is kept between visits.`,
        "Bind sign-in in `npx speeq setup auth`, or write resolveUser yourself.",
      ),
    );
  else
    out.push(check("P3", "static", "pass", "Cross-session memory", `${mode} for signed-in users`));
  if (store === "mongodb") {
    if (!i.envHas("SPEEQ_MONGODB_URI"))
      out.push(
        check(
          "P4",
          "static",
          "fail",
          "Conversation storage",
          "MongoDB is chosen but SPEEQ_MONGODB_URI is not set.",
          "Add it to .env.local or run `npx speeq setup storage`.",
        ),
      );
    else if (setup?.store?.status !== "persistence-verified")
      out.push(
        check(
          "P4",
          "static",
          "warn",
          "Conversation storage",
          "MongoDB is configured but persistence has not been verified.",
          "Run `npx speeq verify --live-store` (writes and removes test data in speeq_verify_* collections).",
        ),
      );
    else
      out.push(
        check("P4", "static", "pass", "Conversation storage", "MongoDB, persistence verified"),
      );
  } else
    out.push(
      mode === "session"
        ? check(
            "P4",
            "static",
            "pass",
            "Conversation storage",
            "memory store (fine for development)",
          )
        : check(
            "P4",
            "static",
            "warn",
            "Conversation storage",
            "The memory store forgets remembered conversations on restart.",
            "Choose MongoDB in `npx speeq setup storage`.",
          ),
    );
  const sources = setup?.context?.sources ?? [];
  const context = await fs.read(p.context);
  if (!sources.length)
    out.push(check("P5", "static", "skip", "Customer context sources", "None approved."));
  else if (context === undefined)
    out.push(
      check(
        "P5",
        "static",
        "fail",
        "Customer context sources",
        `${sources.length} approved, but ${p.context} is missing.`,
        "Open `npx speeq setup context` and Save.",
      ),
    );
  else
    out.push(
      check(
        "P5",
        "static",
        binding ? "pass" : "warn",
        "Customer context sources",
        `${sources.map((s) => s.id).join(", ")}${binding ? "" : " (they need a signed-in user, and no sign-in is bound)"}`,
      ),
    );
  return out;
}

type VerifyUser = { id: string; tenantId?: string; profile?: { displayName: string } };
/** A resolver that reads the test user from a header, like a cookie session. */
function testResolver(request: Request): VerifyUser | null {
  const id = request.headers.get("x-speeq-verify-user");
  if (!id) return null;
  const tenant = request.headers.get("x-speeq-verify-tenant");
  return {
    id,
    ...(tenant ? { tenantId: tenant } : {}),
    profile: { displayName: id === "verify-a" ? "Asha" : "Bala" },
  };
}
const as = (user?: string, tenant?: string) => ({
  ...(user ? { "x-speeq-verify-user": user } : {}),
  ...(tenant ? { "x-speeq-verify-tenant": tenant } : {}),
});

/** The app's settings applied to a sandbox config (no host code, no network). */
function sandboxConfig(setup: Setup, store: ConversationStore): SpeeqConfig<VerifyUser> {
  return {
    secret: "speeq-verify-secret-speeq-verify-secret",
    agent: {
      name: setup.name ?? "Assistant",
      instructions: setup.agent?.instructions ?? "Help.",
      languages: setup.languages.length ? setup.languages : ["en-IN"],
      ...(setup.agent?.style ? { style: setup.agent.style } : {}),
    },
    llm: new FakeLLMProvider(() => ({ text: "ok" })),
    store,
    logger: { error: () => undefined, warn: () => undefined },
    resolveUser: testResolver,
    allowAnonymous: true,
    updateCheck: false,
    ...(setup.business ? { business: setup.business } : {}),
    ...(setup.greeting ? { greeting: setup.greeting } : {}),
    ...(setup.starters ? { starters: setup.starters } : {}),
    ...(setup.identity?.expose?.length ? { identity: { expose: setup.identity.expose } } : {}),
    ...(setup.memory
      ? { memory: { ...setup.memory, categories: setup.memory.categories as never } }
      : {}),
  };
}

/**
 * Runs the identity, greeting and memory behaviour with the app's settings: guest, sign-in, logout,
 * account and tenant switch, forged identity, greeting names, and (when configured) resume, isolation
 * and clearing. A test user stands in for the app's sign-in.
 */
export async function personalRuntimeChecks(
  setup: Setup | undefined,
  store?: ConversationStore,
): Promise<Check[]> {
  if (!setup) return [check("RP1", "runtime", "skip", "Identity lifecycle", "No setup file.")];
  const out: Check[] = [];
  const speeq = createSpeeq<VerifyUser>(
    sandboxConfig(setup, store ?? createMemoryStore({ quiet: true })),
  );
  const open = async (headers: Record<string, string>, body: object = {}) => {
    const r = await speeq.handler(
      jsonRequest("/api/speeq/session", {
        body: { language: setup.languages[0] ?? "en-IN", ...body },
        headers,
      }),
    );
    return {
      status: r.status,
      body: (await r.json()) as {
        sessionId: string;
        sessionToken: string;
        resumed?: boolean;
        identity?: { state: string };
        config: { greeting?: { text: string } };
      },
    };
  };
  const turn = async (
    s: { sessionId: string; sessionToken: string },
    headers: Record<string, string>,
    text = "hello",
  ) => {
    const r = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text, language: setup.languages[0] ?? "en-IN" },
        token: s.sessionToken,
        headers,
      }),
    );
    if (r.headers.get("content-type")?.includes("event-stream")) await readSseEvents(r);
    else await r.text();
    return r.status;
  };
  try {
    const guest = await open({}, { userId: "verify-a", roles: ["admin"] });
    const a = await open(as("verify-a"));
    const loggedOut = await turn(a.body, {});
    const switched = await turn(a.body, as("verify-b"));
    const tenant = await turn(a.body, as("verify-a", "other-org"));
    const own = await turn(a.body, as("verify-a"));
    const ok =
      guest.body.identity?.state === "anonymous" &&
      a.body.identity?.state === "authenticated" &&
      loggedOut === 401 &&
      switched === 401 &&
      tenant === 401 &&
      own === 200;
    out.push(
      check(
        "RP1",
        "runtime",
        ok ? "pass" : "fail",
        "Identity lifecycle",
        ok
          ? "guest, sign-in, sign-out, account and tenant switch, forged browser identity"
          : `guest=${guest.body.identity?.state} member=${a.body.identity?.state} logout=${loggedOut} switch=${switched} tenant=${tenant} own=${own}`,
      ),
    );
    const gGuest = guest.body.config.greeting?.text ?? "";
    const gMember = a.body.config.greeting?.text ?? "";
    const exposed = (setup.identity?.expose ?? []).includes("displayName");
    const invented =
      /\{[^}]+\}/.test(gGuest + gMember) ||
      gGuest.includes("Asha") ||
      (!exposed && gMember.includes("Asha"));
    out.push(
      !setup.greeting
        ? check(
            "RP2",
            "runtime",
            "skip",
            "Greetings use only real values",
            "No greeting templates configured.",
          )
        : check(
            "RP2",
            "runtime",
            invented ? "fail" : "pass",
            "Greetings use only real values",
            invented
              ? `guest "${gGuest}" member "${gMember}"`
              : `guest: "${gGuest.slice(0, 50)}" · member: "${gMember.slice(0, 50)}"`,
          ),
    );
    const mode = setup.memory?.mode ?? "session";
    if (mode === "session")
      out.push(check("RP3", "runtime", "skip", "Memory isolation", "Session-only memory."));
    else {
      const again = await open(as("verify-a"), { resume: true });
      const other = await open(as("verify-b"), { resume: true });
      const anon = await open({}, { resume: true });
      const msgs = await speeq.handler(
        jsonRequest(`/api/speeq/session/${again.body.sessionId}/messages`, {
          token: again.body.sessionToken,
          headers: as("verify-a"),
        }),
      );
      const text = msgs.ok ? JSON.stringify(await msgs.json()) : "";
      const cleared =
        setup.memory?.allowClear === false
          ? 403
          : (
              await speeq.handler(
                jsonRequest(`/api/speeq/session/${again.body.sessionId}/clear-memory`, {
                  body: {},
                  token: again.body.sessionToken,
                  headers: as("verify-a"),
                }),
              )
            ).status;
      const after = await open(as("verify-a"), { resume: true });
      const good =
        again.body.resumed === true &&
        again.body.sessionId === a.body.sessionId &&
        text.includes("hello") &&
        other.body.sessionId !== a.body.sessionId &&
        !other.body.resumed &&
        !anon.body.resumed &&
        (setup.memory?.allowClear === false
          ? cleared === 403
          : cleared === 200 && !after.body.resumed);
      out.push(
        check(
          "RP3",
          "runtime",
          good ? "pass" : "fail",
          "Memory isolation",
          good
            ? "resume own conversation, never another user's or a guest's, clearing works"
            : `resumed=${again.body.resumed} other=${other.body.resumed} anon=${anon.body.resumed} clear=${cleared} afterClear=${after.body.resumed}`,
        ),
      );
    }
  } catch (e) {
    out.push(
      check(
        "RP1",
        "runtime",
        "fail",
        "Identity lifecycle",
        e instanceof Error ? e.message.slice(0, 200) : "failed",
      ),
    );
  }
  return out;
}

/** The part of a MongoDB `Db` the live check needs (any driver 6+ `Db` fits). */
export interface LiveDb {
  collection(name: string): { drop(): Promise<unknown> };
}

/**
 * Proves persistence against the developer's own MongoDB: runs the resume, isolation and clearing
 * round trip in fresh `speeq_verify_<run>_*` collections, then drops them. Touches nothing else.
 */
export async function liveStoreCheck(setup: Setup, db: LiveDb): Promise<Check> {
  const { createMongoStore } = await import("@speeq/store-mongodb");
  const prefix = `speeq_verify_${Date.now().toString(36)}_`;
  const store = createMongoStore({ db: db as never, collectionPrefix: prefix });
  try {
    const checks = await personalRuntimeChecks(
      {
        ...setup,
        memory: {
          ...setup.memory,
          mode: setup.memory?.mode === "preferences" ? "preferences" : "persistent",
          allowClear: true,
        },
      },
      store,
    );
    const rp3 = checks.find((c) => c.id === "RP3");
    const rp1 = checks.find((c) => c.id === "RP1");
    const ok = rp1?.status === "pass" && rp3?.status === "pass";
    return check(
      "L1",
      "host",
      ok ? "pass" : "fail",
      "Conversation persistence in MongoDB",
      ok
        ? "a conversation was stored, continued by its owner only, and cleared"
        : (rp3?.detail ?? rp1?.detail ?? "failed"),
    );
  } finally {
    for (const name of ["sessions", "events", "preferences"])
      await db
        .collection(`${prefix}${name}`)
        .drop()
        .catch(() => undefined);
  }
}
