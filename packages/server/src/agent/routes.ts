import { SpeeqError } from "@speeq/core";
import type { RouteDefinition } from "../define.js";

/** A validated navigation target. */
export interface NavigationTarget {
  routeId: string;
  href: string;
  params: Record<string, unknown>;
}

/**
 * Builds the `href` for a route from params. The route must exist in the manifest and the
 * params must pass its schema. This is how the model is kept from inventing URLs. Path params
 * (`:slug`) are URL-encoded; other params become the query string.
 */
export function resolveNavigation(
  routes: ReadonlyMap<string, RouteDefinition>,
  routeId: string,
  rawParams: unknown,
): NavigationTarget {
  const route = routes.get(routeId);
  if (!route) {
    throw new SpeeqError("INVALID_INPUT", {
      message: `Unknown route "${routeId}". Use one of: ${[...routes.keys()].join(", ")}.`,
    });
  }
  const input = rawParams ?? {};
  let params: Record<string, unknown> = {};
  if (route.params) {
    const parsed = route.params.safeParse(input);
    if (!parsed.success) {
      throw new SpeeqError("INVALID_INPUT", {
        message: `Invalid params for route "${routeId}": ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      });
    }
    params = parsed.data as Record<string, unknown>;
  } else if (typeof input === "object" && input !== null && Object.keys(input).length > 0) {
    throw new SpeeqError("INVALID_INPUT", { message: `Route "${routeId}" takes no params.` });
  }

  const used = new Set<string>();
  const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") {
      throw new SpeeqError("INVALID_INPUT", {
        message: `Route "${routeId}" needs param "${name}".`,
      });
    }
    used.add(name);
    return encodeURIComponent(String(value));
  });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (used.has(key) || value === undefined || value === null || value === "") continue;
    query.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const qs = query.toString();
  return { routeId, href: qs ? `${path}?${qs}` : path, params };
}
