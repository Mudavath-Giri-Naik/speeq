import {
  type AgentUser,
  type HealthResponse,
  isSpeeqError,
  PROTOCOL_VERSION,
  SpeeqError,
} from "@speeq/core";
import type { Runtime } from "../runtime.js";
import { checkOrigin } from "../security/origin.js";
import { SDK_VERSION } from "../version.js";
import { handleGetSession, handleListSessions } from "./audit.js";
import { errorResponse, json } from "./http.js";
import { handleCreateSession } from "./session.js";
import { handleConfirm, handleTurn } from "./turn.js";

/** A web-standard request handler. */
export type SpeeqHandler = (request: Request) => Promise<Response>;

// Matches the speeq route at the end of the path, wherever the handler is mounted.
const ROUTE_RE =
  /\/(health|session|session\/([^/]+)\/(turn|confirm)|audit\/sessions|audit\/sessions\/([^/]+))\/?$/;

/**
 * Creates the request handler. It only uses `Request`/`Response`, so it runs on Next.js route
 * handlers, any Fetch-API server, Node 20+, Bun, Deno and edge runtimes. It does not depend on its
 * mount path: it routes on the end of the URL path.
 */
export function createRequestHandler<TUser extends AgentUser>(rt: Runtime<TUser>): SpeeqHandler {
  const runtime = rt as unknown as Runtime<AgentUser>;
  return async (request) => {
    const origin = checkOrigin(request, rt.config.allowedOrigins);
    const headers = origin.headers;
    try {
      if (!origin.allowed) throw new SpeeqError("FORBIDDEN", { message: "Origin not allowed." });
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

      const match = ROUTE_RE.exec(new URL(request.url).pathname);
      if (!match) throw new SpeeqError("NOT_FOUND");
      const [, route = "", sessionId, action, auditId] = match;
      const method = request.method;

      if (route === "health" && method === "GET") {
        const body: HealthResponse = {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          sdkVersion: SDK_VERSION,
        };
        return json(body, 200, headers);
      }
      if (route === "session" && method === "POST")
        return await handleCreateSession(rt, request, headers);
      if (sessionId && action === "turn" && method === "POST")
        return await handleTurn(rt, request, decodeURIComponent(sessionId), headers);
      if (sessionId && action === "confirm" && method === "POST")
        return await handleConfirm(rt, request, decodeURIComponent(sessionId), headers);
      if (route === "audit/sessions" && method === "GET")
        return await handleListSessions(runtime, request, headers);
      if (auditId && method === "GET")
        return await handleGetSession(runtime, request, decodeURIComponent(auditId), headers);
      throw new SpeeqError("NOT_FOUND");
    } catch (error) {
      if (!isSpeeqError(error)) rt.config.logger.error("request failed", error);
      return errorResponse(error, headers);
    }
  };
}
