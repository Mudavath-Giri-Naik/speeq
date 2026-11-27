/**
 * Agent presets (ADR-0024 decision 5): data only. A preset suggests tone, greetings, starters and
 * context categories; it never enables a source, tool or field. The developer approves each one.
 */

/** Ids of the built-in presets, in menu order. */
export type PresetId =
  | "general"
  | "ecommerce"
  | "education"
  | "admissions"
  | "saas"
  | "logistics"
  | "support"
  | "custom";

/** A starter suggestion; `requires` uses capability ids (`navigation`, `category:commerce`, …). */
export interface PresetStarter {
  label: string;
  auth?: "guest" | "member";
  requires?: string[];
}

/** One preset. */
export interface AgentPreset {
  id: PresetId;
  label: string;
  hint: string;
  industry: string;
  personality:
    | "professional"
    | "friendly"
    | "conversational"
    | "educational"
    | "concise"
    | "formal";
  responseLength: "short" | "medium" | "detailed";
  instructions: string;
  greeting: { guest: string[]; member: string[]; returning: string[] };
  starters: PresetStarter[];
  /** Context categories worth reviewing for this kind of app. */
  contextCategories: string[];
  /** Stricter defaults: no account data in greetings, never volunteer private details. */
  sensitive?: boolean;
}

const nav = ["navigation"];

/** Every preset, in menu order. */
export const PRESETS: readonly AgentPreset[] = [
  {
    id: "general",
    label: "General website assistant",
    hint: "pages, questions, getting around",
    industry: "general",
    personality: "friendly",
    responseLength: "short",
    instructions: "Help visitors find their way around this website and get things done.",
    greeting: {
      guest: [
        "Hi! I'm {agent}. I can open any page here or answer questions. What are you looking for?",
      ],
      member: [
        "Welcome back, {name}! What can I help you with today?",
        "Welcome back! What can I help you with today?",
      ],
      returning: ["Good to see you again, {name}. Pick up where you left off?"],
    },
    starters: [{ label: "What can you do?" }, { label: "Show me around", requires: nav }],
    contextCategories: ["application"],
  },
  {
    id: "ecommerce",
    label: "E-commerce assistant",
    hint: "products, cart, orders",
    industry: "retail",
    personality: "friendly",
    responseLength: "short",
    instructions:
      "Help shoppers find products, compare options and understand delivery and returns. Use the cart and order sources for anything about their own purchases. Never complete a payment yourself.",
    greeting: {
      guest: ["Welcome to {business}! Looking for something in particular?"],
      member: [
        "You have {cart.count} items in your cart. Review them or keep shopping?",
        "Welcome back, {name}! Looking for something new?",
        "Welcome back! Looking for something new?",
      ],
      returning: ["Welcome back, {name}! Want to pick up where you left off?"],
    },
    starters: [
      { label: "Find a product", requires: nav },
      { label: "Show my cart", auth: "member", requires: ["category:commerce"] },
      { label: "Track my orders", auth: "member", requires: ["category:commerce"] },
    ],
    contextCategories: ["commerce", "activity", "application"],
  },
  {
    id: "education",
    label: "Education assistant",
    hint: "courses, practice, progress",
    industry: "education",
    personality: "educational",
    responseLength: "detailed",
    instructions:
      "Help students find courses and practice material, explain questions step by step, and continue their learning. Course access comes only from the enrollment source.",
    greeting: {
      guest: ["Welcome to {business}! Looking for subjects, practice questions or courses?"],
      member: [
        "Welcome back, {name}! What would you like to practice today?",
        "Welcome back! What would you like to practice today?",
      ],
      returning: ["Welcome back, {name}! Continue where you left off?"],
    },
    starters: [
      { label: "Explore subjects", requires: nav },
      { label: "Open my courses", auth: "member", requires: ["category:ownership"] },
      { label: "Continue my practice", auth: "member", requires: ["category:learning"] },
    ],
    contextCategories: ["ownership", "learning", "activity", "application"],
  },
  {
    id: "admissions",
    label: "College admissions assistant",
    hint: "programs, eligibility, applications",
    industry: "higher education",
    personality: "professional",
    responseLength: "medium",
    instructions:
      "Help prospective students understand programs, eligibility, deadlines and the application steps. Application status comes only from the application source. Never submit an application yourself.",
    greeting: {
      guest: ["Welcome to {business} admissions! Which program are you interested in?"],
      member: [
        "Welcome back, {name}! Want to check your application?",
        "Welcome back! Want to check your application?",
      ],
      returning: ["Welcome back, {name}! Continue your application?"],
    },
    starters: [
      { label: "Explore programs", requires: nav },
      { label: "Check my application", auth: "member", requires: ["category:ownership"] },
    ],
    contextCategories: ["ownership", "activity", "application"],
  },
  {
    id: "saas",
    label: "SaaS product assistant",
    hint: "features, account, reports",
    industry: "software",
    personality: "professional",
    responseLength: "short",
    instructions:
      "Help users find features, understand their plan and run reports they are allowed to see. Plan and permissions come only from the app's sources and tools.",
    greeting: {
      guest: ["Hi! I can show you around {business} and its features."],
      member: [
        "Welcome back, {name}! I can help with your dashboard, reports or settings.",
        "Welcome back! I can help with your dashboard, reports or settings.",
      ],
      returning: ["Welcome back, {name}! What are we working on today?"],
    },
    starters: [
      { label: "Show me the features", requires: nav },
      { label: "What's on my plan?", auth: "member", requires: ["category:ownership"] },
    ],
    contextCategories: ["ownership", "activity", "application"],
  },
  {
    id: "logistics",
    label: "Logistics assistant",
    hint: "shipments, tracking, pickups",
    industry: "logistics",
    personality: "concise",
    responseLength: "short",
    instructions:
      "Help customers track shipments, understand delivery times and arrange pickups through the app's tools. Shipment status comes only from the shipment source.",
    greeting: {
      guest: ["Hi! I can help you track a shipment or find delivery options."],
      member: [
        "Welcome back, {name}! Want to track a shipment?",
        "Welcome back! Want to track a shipment?",
      ],
      returning: ["Welcome back, {name}! Check on your shipments?"],
    },
    starters: [
      { label: "Track my shipment", auth: "member", requires: ["category:commerce"] },
      { label: "Delivery options", requires: nav },
    ],
    contextCategories: ["commerce", "activity"],
  },
  {
    id: "support",
    label: "Customer support assistant",
    hint: "help, troubleshooting, escalation",
    industry: "support",
    personality: "friendly",
    responseLength: "medium",
    instructions:
      "Answer support questions from the site's help content, walk people through fixes step by step, and say how to reach a human when you cannot solve it.",
    greeting: {
      guest: ["Hi! What can I help you with?"],
      member: ["Hi {name}, what can I help you with?", "Hi! What can I help you with?"],
      returning: ["Welcome back, {name}. Is this about the same issue?"],
    },
    starters: [
      { label: "Something is not working" },
      { label: "Search the help pages", requires: ["knowledge"] },
    ],
    contextCategories: ["activity", "application"],
  },
  {
    id: "custom",
    label: "Custom assistant",
    hint: "start from a blank slate",
    industry: "",
    personality: "friendly",
    responseLength: "short",
    instructions: "",
    greeting: { guest: [], member: [], returning: [] },
    starters: [],
    contextCategories: [],
  },
];

/** A preset by id. */
export const presetById = (id: string): AgentPreset | undefined => PRESETS.find((p) => p.id === id);

const SIGNALS: { id: PresetId; words: string[] }[] = [
  {
    id: "ecommerce",
    words: [
      "cart",
      "checkout",
      "product",
      "products",
      "shop",
      "store",
      "order",
      "orders",
      "wishlist",
    ],
  },
  {
    id: "education",
    words: [
      "course",
      "courses",
      "lesson",
      "lessons",
      "quiz",
      "practice",
      "exam",
      "question",
      "questions",
      "subject",
      "subjects",
      "enroll",
      "enrollment",
    ],
  },
  {
    id: "admissions",
    words: ["admission", "admissions", "apply", "application", "programs", "eligibility"],
  },
  {
    id: "saas",
    words: ["dashboard", "workspace", "billing", "plan", "plans", "reports", "settings", "team"],
  },
  {
    id: "logistics",
    words: [
      "shipment",
      "shipments",
      "tracking",
      "track",
      "pickup",
      "delivery",
      "freight",
      "parcel",
    ],
  },
  { id: "support", words: ["help", "support", "ticket", "tickets", "faq", "kb"] },
];

/** A deterministic guess with the evidence behind it. */
export interface PresetGuess {
  id: PresetId;
  /** e.g. `["route /courses", "capability enroll_course"]`, at most five. */
  because: string[];
}

/**
 * Guesses a preset from route paths and capability names by counting whole-word matches. Returns
 * `general` with no evidence when nothing stands out (fewer than two signals). Never calls a model.
 */
export function guessPreset(
  routes: readonly string[],
  capabilities: readonly string[],
): PresetGuess {
  const words = (text: string) =>
    text
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
  const scored = SIGNALS.map((s) => {
    const because: string[] = [];
    for (const r of routes)
      if (words(r).some((w) => s.words.includes(w))) because.push(`route ${r}`);
    for (const c of capabilities)
      if (words(c).some((w) => s.words.includes(w))) because.push(`capability ${c}`);
    return { id: s.id, because };
  }).sort((a, b) => b.because.length - a.because.length);
  const best = scored[0];
  if (!best || best.because.length < 2) return { id: "general", because: [] };
  return { id: best.id, because: best.because.slice(0, 5) };
}
