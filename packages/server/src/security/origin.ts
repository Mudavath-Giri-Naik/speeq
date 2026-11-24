/** Result of {@link checkOrigin}. */
export interface OriginCheck {
  allowed: boolean;
  /** CORS headers to add to the response (only for allowed cross-origin requests). */
  headers: Record<string, string>;
}

/**
 * Same-origin by default. A request with an `Origin` header that differs from the request's own
 * origin is refused unless listed in `allowedOrigins`. Requests without `Origin` (server-to-server,
 * same-origin GET in some browsers) are allowed. Auth is still required for them.
 */
export function checkOrigin(request: Request, allowedOrigins: readonly string[]): OriginCheck {
  const origin = request.headers.get("origin");
  if (!origin) return { allowed: true, headers: {} };
  if (origin === new URL(request.url).origin || origin === forwardedOrigin(request)) {
    return { allowed: true, headers: {} };
  }
  if (allowedOrigins.includes(origin)) {
    return {
      allowed: true,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      },
    };
  }
  return { allowed: false, headers: {} };
}

/** The origin as seen by the browser when the app sits behind a proxy (Vercel, nginx). */
function forwardedOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
