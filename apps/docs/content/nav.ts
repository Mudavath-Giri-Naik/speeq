export interface NavPage {
  /** "guides/nextjs" reads content/guides/nextjs.md and lives at /docs/guides/nextjs. */
  slug: string;
  title: string;
  /** Pages rendered by their own route instead of a markdown file. */
  custom?: boolean;
}
export interface NavSection {
  title: string;
  pages: NavPage[];
}

export const nav: NavSection[] = [
  {
    title: "Start here",
    pages: [
      { slug: "introduction", title: "Introduction" },
      { slug: "quickstart", title: "Quickstart" },
      { slug: "install", title: "Install" },
      { slug: "guides/cli", title: "Set up with one command" },
      { slug: "ai-setup", title: "Set up with an AI assistant" },
    ],
  },
  {
    title: "Guides",
    pages: [
      { slug: "guides/nextjs", title: "Add speeq to Next.js" },
      { slug: "guides/tools", title: "Let it do things (tools)" },
      { slug: "guides/knowledge", title: "Let it answer from your content" },
      { slug: "guides/routes", title: "Open pages (routes)" },
      { slug: "guides/ui-actions", title: "Let it act on the page (UI actions)" },
      { slug: "guides/control-center", title: "Manage it from the terminal" },
      { slug: "guides/personalisation", title: "Personalisation" },
      { slug: "guides/customer-context", title: "Customer context" },
      { slug: "guides/greetings", title: "Greetings, style and presets" },
      { slug: "guides/memory", title: "Conversation memory" },
      { slug: "guides/models", title: "Connect a model" },
      { slug: "guides/stores", title: "Choose a store" },
      { slug: "guides/multilingual", title: "Multilingual speech" },
      { slug: "guides/vocabulary", title: "Domain vocabulary" },
      { slug: "guides/voice-providers", title: "Voice providers" },
      { slug: "guides/voice", title: "Voice and languages" },
      { slug: "guides/testing", title: "Test without a model" },
      { slug: "guides/audit-viewer", title: "Build an audit viewer" },
      { slug: "guides/deployment", title: "Go to production" },
      { slug: "guides/dashboard", title: "The usage dashboard" },
    ],
  },
  {
    title: "Concepts",
    pages: [
      { slug: "concepts/how-it-works", title: "How it works" },
      { slug: "concepts/security", title: "Sessions and security" },
      { slug: "concepts/confirmations", title: "Asking before changes" },
      { slug: "concepts/audit", title: "The audit log" },
      { slug: "concepts/privacy", title: "Privacy and telemetry" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { slug: "reference/server-config", title: "Server settings" },
      { slug: "reference/client", title: "Browser client" },
      { slug: "reference/react", title: "React hooks" },
      { slug: "reference/protocol", title: "HTTP protocol" },
      { slug: "reference/errors", title: "Error codes" },
      { slug: "reference/environment", title: "Environment variables" },
      { slug: "reference/telemetry", title: "Telemetry fields" },
    ],
  },
  {
    title: "More",
    pages: [
      { slug: "packages", title: "Packages", custom: true },
      { slug: "releases", title: "Releases", custom: true },
      { slug: "faq", title: "FAQ" },
      { slug: "decisions", title: "Design decisions" },
      { slug: "security-policy", title: "Security policy" },
    ],
  },
];

export const flatNav: NavPage[] = nav.flatMap((section) => section.pages);

export function findNav(
  slug: string,
): { section: NavSection; page: NavPage; index: number } | null {
  for (const section of nav) {
    const page = section.pages.find((p) => p.slug === slug);
    if (page) return { section, page, index: flatNav.indexOf(page) };
  }
  return null;
}

export function neighbours(slug: string): { prev: NavPage | null; next: NavPage | null } {
  const index = flatNav.findIndex((p) => p.slug === slug);
  if (index < 0) return { prev: null, next: null };
  return { prev: flatNav[index - 1] ?? null, next: flatNav[index + 1] ?? null };
}
