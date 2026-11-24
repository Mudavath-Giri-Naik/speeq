import {
  type AgentUser,
  type ClientConfig,
  CreateSessionRequestSchema,
  type CreateSessionResponse,
  createId,
  PROTOCOL_VERSION,
  SpeeqError,
} from "@speeq/core";
import { AuditRecorder } from "../audit/recorder.js";
import type { Runtime } from "../runtime.js";
import { signSessionToken } from "../security/token.js";
import { json, readJson } from "./http.js";

/** Public client configuration derived from the server config. */
export function clientConfig(rt: Runtime<AgentUser>): ClientConfig {
  const c = rt.config;
  return {
    agentName: c.agentName,
    languages: c.languages,
    defaultLanguage: c.defaultLanguage,
    features: {
      navigation: c.routes.size > 0,
      knowledge: c.knowledge.length > 0,
      tools: c.tools.size > 0,
      audit: c.audit.authorize !== undefined,
    },
    routes: [...c.routes.values()].map((r) => ({ id: r.id, title: r.title })),
  };
}

/** `POST /session`: creates a session and returns a signed token. */
export async function handleCreateSession<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  headers: Record<string, string>,
): Promise<Response> {
  const body = await readJson(request, CreateSessionRequestSchema, rt.config.maxRequestBytes);
  const user = await rt.resolveUser(request);
  if (!user && !rt.config.allowAnonymous) throw new SpeeqError("UNAUTHENTICATED");
  const userId = user?.id ?? null;
  rt.limitSession(request, userId);

  const language =
    body.language && rt.config.languages.includes(body.language)
      ? body.language
      : rt.config.defaultLanguage;
  const sessionId = createId("ses");
  const startedAt = new Date().toISOString();
  await rt.config.raw.store.createSession({ id: sessionId, userId, language, startedAt });
  const recorder = new AuditRecorder(rt.config, rt.config.raw.store, sessionId, userId);
  await recorder.record("session.started", {
    userId,
    language,
    ...(body.context ? { context: body.context } : {}),
  });
  rt.telemetry.session();
  rt.maybeRunRetention();

  const exp = Math.floor(Date.now() / 1000) + rt.config.sessionTtlSeconds;
  const response: CreateSessionResponse = {
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    sessionToken: await signSessionToken({ sid: sessionId, uid: userId, exp }, rt.config.secret),
    expiresAt: new Date(exp * 1000).toISOString(),
    config: clientConfig(rt as Runtime<AgentUser>),
  };
  return json(response, 200, headers);
}
