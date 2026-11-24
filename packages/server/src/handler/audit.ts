import {
  type AgentUser,
  type SessionDetailResponse,
  SessionFilterSchema,
  type SessionListResponse,
  SpeeqError,
} from "@speeq/core";
import type { Runtime } from "../runtime.js";
import { json } from "./http.js";

/**
 * Secure by default: without `audit.authorize` the audit routes do not exist (404). With it,
 * a request that `authorize` rejects gets 403. `authorize` errors count as a rejection.
 */
async function requireAuditAccess(rt: Runtime<AgentUser>, request: Request): Promise<void> {
  const authorize = rt.config.audit.authorize;
  if (!authorize) throw new SpeeqError("NOT_FOUND");
  let ok = false;
  try {
    ok = (await authorize(request)) === true;
  } catch (error) {
    rt.config.logger.error("audit.authorize threw; denying access", error);
  }
  if (!ok) throw new SpeeqError("FORBIDDEN");
}

/** `GET /audit/sessions?limit&cursor&userId&from&to` */
export async function handleListSessions(
  rt: Runtime<AgentUser>,
  request: Request,
  headers: Record<string, string>,
): Promise<Response> {
  await requireAuditAccess(rt, request);
  const params = new URL(request.url).searchParams;
  const parsed = SessionFilterSchema.safeParse({
    userId: params.get("userId") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) throw new SpeeqError("INVALID_INPUT", { message: "Invalid filter." });
  const page = await rt.config.raw.store.listSessions(parsed.data, params.get("cursor"));
  const body: SessionListResponse = page;
  return json(body, 200, headers);
}

/** `GET /audit/sessions/:id` */
export async function handleGetSession(
  rt: Runtime<AgentUser>,
  request: Request,
  sessionId: string,
  headers: Record<string, string>,
): Promise<Response> {
  await requireAuditAccess(rt, request);
  const store = rt.config.raw.store;
  const session = await store.getSessionSummary(sessionId);
  if (!session) throw new SpeeqError("NOT_FOUND");
  const body: SessionDetailResponse = { session, events: await store.listEvents(sessionId) };
  return json(body, 200, headers);
}
