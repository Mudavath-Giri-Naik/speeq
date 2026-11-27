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

/**
 * An action the agent may ask the page to run, for example opening a panel. Create one with
 * {@link defineUiAction}. The handler lives in the browser (`useSpeeqAction`); this declaration
 * is the only thing the model sees, so a page cannot add actions the server did not declare.
 */
export interface UiActionDefinition<
  TInput extends z.ZodType = z.ZodType,
  TUser extends AgentUser = AgentUser,
> {
  /** `ui_` followed by lowercase letters, digits and underscores, e.g. `ui_open_cart`. */
  name: string;
  /** Shown to the model. Describe what the page does, not how. */
  description: string;
  /** Validated on the server before the action is sent to the page. Must be a `z.object(...)`. */
  input: TInput;
  /** `write` actions ask the user before the page runs them. */
  risk: "read" | "write";
  /** Ask the user first. Defaults to `true` for `write` actions, `false` otherwise. */
  confirm?: boolean;
  /** Text shown to the user, for example in a confirmation. Do not echo secrets. */
  summary(input: z.output<TInput>, ctx: AgentContext<TUser>): string;
}

/**
 * Defines a UI action with full type inference for `summary`. The browser handler receives the
 * validated arguments but must still treat them as untrusted input.
 *
 * @example
 * defineUiAction({
 *   name: "ui_open_cart",
 *   description: "Open the shopping cart panel",
 *   input: z.object({}),
 *   risk: "read",
 *   summary: () => "Open the cart",
 * });
 */
export function defineUiAction<TInput extends z.ZodType, TUser extends AgentUser = AgentUser>(
  action: UiActionDefinition<TInput, TUser>,
): UiActionDefinition<TInput, TUser> {
  return action;
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
