import type { Language, PageContext } from "../schemas/common.js";

/**
 * The signed-in user as resolved by the developer's `resolveUser`. speeq only reads `id`. Use
 * your own type with any extra fields (roles, plan, org): `createSpeeq<MyUser>({...})`, and tools
 * receive it untouched in `ctx.user`.
 */
export interface AgentUser {
  id: string;
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
