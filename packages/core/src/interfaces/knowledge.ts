import type { AgentContext, AgentUser } from "./context.js";

/** One search hit from a {@link KnowledgeSource}. */
export interface KnowledgeResult {
  id: string;
  title: string;
  /** The text the model may quote. It is treated as untrusted data, never as instructions. */
  content: string;
  /** A link inside the app, if any. */
  href?: string;
  score?: number;
}

/**
 * Searchable developer data (FAQ, questions, docs). The search runs in the developer's backend
 * with the user's context, so it can respect permissions.
 */
export interface KnowledgeSource<TUser extends AgentUser = AgentUser> {
  /** Stable id, e.g. `questions`. */
  id: string;
  /** Tells the model what this source contains and when to search it. */
  description: string;
  search(query: string, ctx: AgentContext<TUser>): Promise<KnowledgeResult[]>;
}
