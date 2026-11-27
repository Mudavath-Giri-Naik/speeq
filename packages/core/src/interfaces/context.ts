import type { Language, PageContext } from "../schemas/common.js";

/**
 * The signed-in user as resolved by the developer's `resolveUser`. speeq only reads `id`. Use
 * your own type with any extra fields (roles, plan, org): `createSpeeq<MyUser>({...})`, and tools
 * receive it untouched in `ctx.user`.
 */
export interface AgentUser {
  /** Stable, app-scoped user id. Used for isolation only: never sent to the model or the browser. */
  id: string;
  /**
   * Organisation or workspace the user is acting in, if the app has tenants. A change of tenant is
   * treated like a change of user (fresh conversation). Never sent to the model or the browser.
   */
  tenantId?: string;
  /** Profile facts the app approves. Reach the model only if listed in `identity.expose`. */
  profile?: AgentUserProfile;
}

/** Profile facts from the app's own session. Never an authorization input for the model. */
export interface AgentUserProfile {
  displayName?: string;
  preferredName?: string;
  /** BCP 47 tag, e.g. `te-IN`. */
  locale?: string;
  roles?: string[];
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Context passed to every tool handler and knowledge source. It carries the same user and request
 * the website sees, so a tool can apply the same permission checks the website applies.
 */
export interface AgentContext<TUser extends AgentUser = AgentUser> {
  /** The signed-in user, or `null` for anonymous sessions. */
  user: TUser | null;
  session: { id: string };
  /** The incoming web-standard request (cookies, headers). */
  request: Request;
  /** Aborts when the client disconnects or the tool times out. */
  signal: AbortSignal;
  language: Language;
  pageContext: PageContext | undefined;
}
