/**
 * The scripted conversation behind the home page demo. Pure functions only, so it is easy to test.
 * Nothing here talks to a network or a model. It is a simulation of what speeq does.
 */

export type Route = "home" | "pricing" | "orders";
export type OrderStatus = "shipped" | "cancelled";

export type Step =
  | { type: "tool"; label: string }
  | { type: "say"; text: string }
  | { type: "navigate"; route: Route }
  | { type: "confirm"; summary: string; onApprove: Step[]; onReject: Step[] }
  | { type: "cancelOrder" };

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}
export interface Pending {
  summary: string;
  onApprove: Step[];
  onReject: Step[];
}
export interface DemoState {
  messages: Message[];
  tools: string[];
  pending: Pending | null;
  route: Route;
  order: OrderStatus;
  nextId: number;
}

export const initialState: DemoState = {
  messages: [],
  tools: [],
  pending: null,
  route: "home",
  order: "shipped",
  nextId: 1,
};

export interface Preset {
  id: "pricing" | "order" | "cancel";
  label: string;
  prompt: string;
  keywords: string[];
  steps: Step[];
}

export const presets: Preset[] = [
  {
    id: "pricing",
    label: "Show me pricing",
    prompt: "Show me pricing",
    keywords: ["pricing", "price", "plan", "plans", "cost", "pay"],
    steps: [
      { type: "say", text: "Sure. Opening the pricing page for you." },
      { type: "navigate", route: "pricing" },
    ],
  },
  {
    id: "order",
    label: "Where is my order?",
    prompt: "Where is my order?",
    keywords: ["order", "orders", "where", "track", "shipping", "delivery", "package"],
    steps: [
      { type: "tool", label: "find_order" },
      { type: "navigate", route: "orders" },
      { type: "say", text: "Order #1042 shipped yesterday. It should arrive on Friday." },
    ],
  },
  {
    id: "cancel",
    label: "Cancel order 1042",
    prompt: "Cancel order 1042",
    keywords: ["cancel", "refund", "remove", "stop", "delete", "1042"],
    steps: [
      { type: "tool", label: "find_order" },
      { type: "navigate", route: "orders" },
      {
        type: "confirm",
        summary: "Cancel order #1042?",
        onApprove: [
          { type: "tool", label: "cancel_order" },
          { type: "cancelOrder" },
          { type: "say", text: "Done. Order #1042 is cancelled." },
        ],
        onReject: [{ type: "say", text: "Okay, I left your order as it is." }],
      },
    ],
  },
];

/** Pick the preset that best matches free text. Falls back to the first one. */
export function matchPreset(input: string): Preset {
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let best = presets[0] as Preset;
  let bestScore = 0;
  for (const preset of presets) {
    const score = preset.keywords.reduce((sum, k) => sum + (words.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      best = preset;
      bestScore = score;
    }
  }
  return best;
}

export function addUserMessage(state: DemoState, text: string): DemoState {
  return {
    ...state,
    tools: [],
    messages: [...state.messages, { id: state.nextId, role: "user", text }],
    nextId: state.nextId + 1,
  };
}

/** Apply one scripted step to the state. */
export function applyStep(state: DemoState, step: Step): DemoState {
  switch (step.type) {
    case "tool":
      return { ...state, tools: [...state.tools, step.label] };
    case "say":
      return {
        ...state,
        messages: [...state.messages, { id: state.nextId, role: "assistant", text: step.text }],
        nextId: state.nextId + 1,
      };
    case "navigate":
      return { ...state, route: step.route };
    case "cancelOrder":
      return { ...state, order: "cancelled" };
    case "confirm":
      return {
        ...state,
        pending: { summary: step.summary, onApprove: step.onApprove, onReject: step.onReject },
      };
  }
}

/** The steps that follow the visitor's answer to a pending approval. */
export function resolvePending(
  state: DemoState,
  approved: boolean,
): { state: DemoState; steps: Step[] } {
  if (!state.pending) return { state, steps: [] };
  const steps = approved ? state.pending.onApprove : state.pending.onReject;
  return { state: { ...state, pending: null, tools: [] }, steps };
}

export function reset(): DemoState {
  return { ...initialState };
}
