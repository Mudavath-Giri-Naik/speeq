import type { AgentContext, AgentUser } from "@speeq/core";
import type { z } from "zod";

/** What kind of customer or app information a context source provides. */
export type ContextCategory =
  | "identity"
  | "ownership"
  | "activity"
  | "commerce"
  | "learning"
  | "application"
  | "custom";

/** Every {@link ContextCategory}, in display order. */
export const CONTEXT_CATEGORIES: readonly ContextCategory[] = [
  "identity",
  "ownership",
  "activity",
  "commerce",
  "learning",
  "application",
  "custom",
];

/**
 * A source of current, authorized information for the agent: the customer's cart, enrollments,
 * subscriptions, recent activity, or app state. It wraps a service your app already has; speeq
 * keeps no copy. Create one with {@link defineContext}.
 */
export interface ContextProviderDefinition<
  TOutput extends z.ZodType = z.ZodType,
  TUser extends AgentUser = AgentUser,
> {
  /** Stable id the model uses, `[a-z][a-z0-9_]{0,40}`, e.g. `cart`. */
  id: string;
  /** One line telling the model what this source holds and when to use it. */
  description: string;
  category: ContextCategory;
  /** `required` (default): never runs without a signed-in user. `optional`: also for visitors. */
  auth?: "required" | "optional";
  /**
   * `on-demand` (default): the model fetches it with `get_context` when a question needs it.
   * `initial`: fetched at the start of every message and put in the prompt. Keep these small.
   */
  load?: "initial" | "on-demand";
  /** Validates what `fetch` returns. A mismatch is reported to the model as unavailable data. */
  output: TOutput;
  /**
   * The only fields the model may see, as paths: `count`, `items[].title`, `plan.name`.
   * Everything else is dropped. An exposed object keeps its own keys, minus restricted ones.
   */
  expose: string[];
  /** Extra field names never to show, on top of speeq's built-in list (passwords, tokens, cards…). */
  sensitive?: string[];
  /** Exposed fields that greetings may use, e.g. `["count"]` (see `greeting` in the config). */
  greeting?: string[];
  /** Maximum items per array. Default 20. */
  maxItems?: number;
  /** Maximum JSON characters the model sees. Default 2000. */
  maxChars?: number;
  /** Default 1500 ms. */
  timeoutMs?: number;
  /**
   * Runs in your backend with the **server-verified** user in `ctx.user` (never browser data).
   * Call your existing service and apply your usual permission checks for that user and tenant.
   */
  fetch(ctx: AgentContext<TUser>): unknown;
}

/**
 * Defines a context source with type inference for its output.
 *
 * @example
 * defineContext({
 *   id: "cart",
 *   description: "Items in the customer's cart right now",
 *   category: "commerce",
 *   output: z.object({ items: z.array(z.object({ title: z.string(), qty: z.number() })) }),
 *   expose: ["items[].title", "items[].qty"],
 *   fetch: (ctx) => getCart(ctx.user!.id),
 * })
 */
export function defineContext<TOutput extends z.ZodType, TUser extends AgentUser = AgentUser>(
  definition: ContextProviderDefinition<TOutput, TUser>,
): ContextProviderDefinition<TOutput, TUser> {
  return definition;
}
