import type { Language, PageContext } from "../schemas/common.js";

/**
 * The signed-in user as resolved by the developer's `resolveUser`. speeq only reads `id`; any
 * other fields (roles, plan, org) are passed through to tools untouched.
 */
export interface AgentUser {
  id: string;
  roles?: string[];
  [key: string]: unknown;
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
