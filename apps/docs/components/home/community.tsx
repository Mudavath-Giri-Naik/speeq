import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { REPO_URL } from "@/lib/site";
import type { SiteStats } from "@/lib/stats";
import { formatCount } from "@/lib/stats";
import { GithubIcon, StarIcon } from "../icons";
import { Em, Section, SectionHead, Status, type StatusKind } from "./kit";

const ROADMAP: Array<[string, StatusKind, string]> = [
  ["Core interaction SDK", "available", "Server handler, browser client and React hooks."],
  ["Application execution", "available", "Validated tools, confirmations and permission checks."],
  ["Multilingual voice", "available", "Browser voice, plus server voice for Telugu and Hindi."],
  [
    "Audit log and usage counters",
    "available",
    "Your own audit data, and anonymous counters on a dashboard you run.",
  ],
  ["Natural conversation", "development", "Quieter interruptions, voices, latency and call mode."],
  [
    "Application discovery and manifests",
    "planned",
    "Find routes, endpoints and schemas, then review them.",
  ],
  ["Developer CLI", "planned", "Scaffolding and scanning from the terminal."],
  ["MCP integration", "planned", "A dedicated server for coding agents."],
  ["Proactive engagement", "planned", "Context-aware help that you control."],
  ["Business analytics", "planned", "Intents, journeys, leads and verified outcomes."],
  ["More frameworks", "planned", "Next.js is ready today; other adapters are not."],
];

const LINKS = [
  { label: "GitHub repository", href: REPO_URL, external: true },
  { label: "Report an issue", href: `${REPO_URL}/issues`, external: true },
  { label: "Contributing guide", href: `${REPO_URL}/blob/main/CONTRIBUTING.md`, external: true },
  { label: "MIT license", href: `${REPO_URL}/blob/main/LICENSE`, external: true },
  { label: "Releases", href: "/docs/releases", external: false },
  { label: "Security policy", href: "/docs/security-policy", external: false },
];

/** The roadmap with honest statuses, and real project numbers. Nothing here is invented. */
export function Community({ stats }: { stats: SiteStats }) {
  const gh = stats.github;
  const facts = [
    gh?.stars != null ? ["GitHub stars", formatCount(gh.stars)] : null,
    gh?.forks != null ? ["Forks", formatCount(gh.forks)] : null,
    gh?.openIssues != null ? ["Open issues", formatCount(gh.openIssues)] : null,
    gh?.license ? ["License", gh.license] : ["License", "MIT"],
  ].filter((x): x is [string, string] => x !== null);

  return (
    <Section id="roadmap">
      <SectionHead
        id="roadmap"
        eyebrow="Roadmap and community"
        title={
          <>
            Building the intelligent web, <Em>together.</Em>
          </>
        }
        lede="speeq is an evolving open-source framework, and its direction is public. Statuses reflect what is in the repository today."
      />
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <BlurFade inView>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
            {ROADMAP.map(([name, status, text]) => (
              <li
                key={name}
                className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5"
              >
                <div>
                  <p className="text-[0.92rem] font-medium text-fg">{name}</p>
                  <p className="mt-0.5 text-[0.8rem] text-muted">{text}</p>
                </div>
                <Status kind={status} className="w-fit" />
              </li>
            ))}
          </ol>
        </BlurFade>

        <BlurFade inView delay={0.08}>
          <div className="panel p-5 sm:p-6">
            <p className="mono-label">Open source. Built to be extended.</p>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
              Explore the implementation, contribute improvements, report issues and help shape how
              websites respond to intent.
            </p>
            {facts.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
                {facts.map(([k, v]) => (
                  <div key={k} className="bg-elev px-3 py-2.5">
                    <dt className="text-[0.68rem] text-muted">{k}</dt>
                    <dd className="font-mono text-[0.95rem] text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  <GithubIcon width={14} height={14} />
                  Star on GitHub
                  <StarIcon width={13} height={13} />
                </a>
              </Button>
            </div>
            <ul className="mt-5 space-y-1.5 border-t border-line pt-4">
              {LINKS.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.86rem] text-soft transition-colors hover:text-accent"
                    >
                      {l.label} ↗
                    </a>
                  ) : (
                    <Link
                      href={l.href}
                      className="text-[0.86rem] text-soft transition-colors hover:text-accent"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </BlurFade>
      </div>
    </Section>
  );
}
