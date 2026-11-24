import type { AgentContext, AgentUser, KnowledgeSource } from "@speeq/core";
import type { z } from "zod";

/** `read` tools only look things up. `write` tools change data and need confirmation by default. */
export type ToolRisk = "read" | "write";

/** A developer-defined action the agent can run. Create one with {@link defineTool}. */
export interface ToolDefinition<
  TInput extends z.ZodType = z.ZodType,
  TUser extends AgentUser = AgentUser,
> {
  /** Name the model calls, `[a-zA-Z0-9_-]{1,64}`, e.g. `count_questions`. */
  name: string;
  /** Tells the model what the tool does and when to use it. */
  description: string;
  /** Zod schema for the arguments. The model's arguments are validated against it. */
  input: TInput;
  /** Default `read`. */
  risk?: ToolRisk;
  /** Ask the user before running. Defaults to `true` for `write` tools, `false` otherwise. */
  requiresConfirmation?: boolean;
  /** Text for the confirmation dialog, e.g. `Bookmark question 12?`. */
  confirmationSummary?(input: z.output<TInput>): string;
  /** Overrides `guardrails.toolTimeoutMs` for this tool. */
  timeoutMs?: number;
  /**
   * Runs in your backend with your DB and the signed-in user in `ctx.user`, so apply the same
   * permission checks your website applies. Throw `SpeeqError("FORBIDDEN")` to refuse. The return
   * value is serialized to JSON, truncated, and shown to the model as untrusted data.
   */
  handler(input: z.output<TInput>, ctx: AgentContext<TUser>): unknown;
}

/**
 * Defines a tool with full type inference for `input` in the handler.
 *
 * @example
 * defineTool({
 *   name: "count_questions",
 *   description: "Count questions for a subject",
 *   input: z.object({ subject: z.string() }),
 *   handler: async ({ subject }, ctx) => ({ count: await db.count(subject, ctx.user) }),
 * });
 */
export function defineTool<TInput extends z.ZodType, TUser extends AgentUser = AgentUser>(
  tool: ToolDefinition<TInput, TUser>,
): ToolDefinition<TInput, TUser> {
  return tool;
}

/** A page the agent may navigate to. Create one with {@link defineRoute}. */
export interface RouteDefinition {
  /** Stable id the model uses, e.g. `practice`. */
  id: string;
  /** Path pattern. `:name` segments are filled from params, e.g. `/subjects/:slug`. */
  path: string;
  /** Human title, e.g. `Practice`. */
  title: string;
  /** Helps the model choose the right page. */
  description?: string;
  /**
   * Zod object schema for params. Keys used in `path` fill the path; other keys become the query
   * string. Omit it for routes without params.
   */
  params?: z.ZodObject;
}

/** Defines a navigable route (validated at startup). */
export function defineRoute(route: RouteDefinition): RouteDefinition {
  return route;
}

/** Defines a searchable knowledge source. */
export function defineKnowledgeSource<TUser extends AgentUser = AgentUser>(
  source: KnowledgeSource<TUser>,
): KnowledgeSource<TUser> {
  return source;
}
