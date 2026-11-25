import Link from "next/link";
import { CodeTabs } from "../components/home/code-tabs";
import { CopyCommand } from "../components/home/copy-command";
import { Demo } from "../components/home/demo";
import {
  ArrowIcon,
  BoltIcon,
  CompassIcon,
  EyeOffIcon,
  ListIcon,
  MicIcon,
  PlugIcon,
  ShieldIcon,
  WrenchIcon,
} from "../components/icons";
import { getHomeCodeTabs } from "../lib/home-code";
import { INSTALL_COMMAND, REPO_URL, siteUrl } from "../lib/site";
import { formatCount, getSiteStats } from "../lib/stats";

export const revalidate = 3600;

const features = [
  {
    icon: MicIcon,
    title: "Voice and text",
    text: "Visitors can talk or type. Voice uses the browser, and text always works as a fallback.",
    span: "md:col-span-2",
  },
  {
    icon: CompassIcon,
    title: "Opens your pages",
    text: "Say “show me pricing” and the right page opens, through your own router.",
  },
  {
    icon: WrenchIcon,
    title: "Uses your data",
    text: "Tools run on your server with your rules. The model never touches your database.",
  },
  {
    icon: ShieldIcon,
    title: "Asks before changing things",
    text: "Anything that edits data needs a clear Yes from the visitor. Each Yes works once.",
    span: "md:col-span-2",
  },
  {
    icon: ListIcon,
    title: "A full audit log",
    text: "Every message, tool call and approval is saved in your own database.",
  },
  {
    icon: EyeOffIcon,
    title: "Anonymous by design",
    text: "No speeq cloud. Optional counters are anonymous, and off until you turn them on.",
  },
  {
    icon: PlugIcon,
    title: "Any model",
    text: "Groq, Gemini, or any service with an OpenAI-style API. Or write your own.",
  },
  {
    icon: BoltIcon,
    title: "Works with Next.js today",
    text: "A ready adapter, React hooks, and a five minute quickstart with no keys.",
  },
];

const steps = [
  {
    n: "1",
    title: "The visitor speaks",
    text: "Your page sends the words, and where the visitor is, to your server.",
  },
  {
    n: "2",
    title: "Your server decides",
    text: "speeq asks your model. If it needs data, it runs your tool, with your permission checks.",
  },
  {
    n: "3",
    title: "The page answers",
    text: "The reply streams back. A page opens, or the visitor is asked to approve a change.",
  },
];

export default async function Home() {
  const [stats, tabs] = await Promise.all([getSiteStats(), getHomeCodeTabs()]);
  const speeq = stats.packages.find((p) => p.name === "speeq");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "speeq",
    description: "A headless voice and text assistant for web apps.",
    codeRepository: REPO_URL,
    programmingLanguage: "TypeScript",
    license: "https://opensource.org/license/mit",
    url: siteUrl(),
  };

  return (
    <main>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(jsonLd)}
      </script>

      {/* Hero */}
      <section className="noise relative isolate overflow-hidden">
        <div className="aurora" aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <div className="container-x relative pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
          <Link
            href="/docs/releases"
            className="reveal in mx-auto inline-flex items-center gap-2 rounded-full border border-line-strong bg-elev/60 py-1.5 pr-3 pl-1.5 text-xs text-soft backdrop-blur transition hover:border-accent"
          >
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">
              New
            </span>
            speeq {speeq?.version ?? "0.2"} is on npm
            <ArrowIcon width={14} height={14} />
          </Link>
          <h1 className="mx-auto mt-7 max-w-4xl text-[clamp(2.6rem,8vw,5.6rem)] leading-[1.02] font-bold tracking-[-0.045em] text-fg">
            Give your website <span className="gradient-text">a voice.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,2.4vw,1.3rem)] leading-relaxed text-muted">
            speeq is a voice and text assistant that you add to your own app. It talks, opens pages,
            and answers using your data, with your model and your design.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/docs/quickstart" className="btn btn-primary w-full sm:w-auto">
              Get started
              <ArrowIcon width={18} height={18} />
            </Link>
            <CopyCommand command={INSTALL_COMMAND} />
          </div>
          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-2 sm:gap-4">
            {[
              ["Installs last week", formatCount(speeq?.week)],
              ["GitHub stars", formatCount(stats.github?.stars)],
              ["Version", speeq?.version ?? "–"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-line bg-elev/50 px-2 py-3 backdrop-blur sm:px-4"
              >
                <dd className="text-xl font-semibold text-fg tabular-nums sm:text-2xl">{value}</dd>
                <dt className="mt-0.5 text-[0.7rem] text-muted sm:text-xs">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Demo */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="demo-title">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow">See it work</p>
          <h2
            id="demo-title"
            className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl"
          >
            Try the assistant right here
          </h2>
          <p className="mt-3 text-muted">
            This is a small simulation of what your visitors would see. Ask it to open a page, find
            an order, or cancel one. It will ask before it changes anything.
          </p>
        </div>
        <div className="reveal">
          <Demo />
        </div>
      </section>

      {/* How it works */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="how-title">
        <div className="reveal mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Three steps, all on your side
          </h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.n}
              className="reveal card relative p-6"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <span className="gradient-text text-5xl font-bold tracking-tighter">{step.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-fg">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
              {i < steps.length - 1 && (
                <svg
                  className="absolute top-1/2 -right-5 z-10 hidden h-6 w-8 -translate-y-1/2 text-accent md:block"
                  viewBox="0 0 32 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    className="flow-line"
                    d="M0 12h26"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="m21 6 6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ol>
        <p className="reveal mt-8 text-center text-sm text-muted">
          Your visitor’s messages go to your server and your model. They never go to speeq.{" "}
          <Link href="/docs/concepts/how-it-works" className="text-accent hover:underline">
            Read how it works
          </Link>
        </p>
      </section>

      {/* Code */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="code-title">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="reveal">
            <p className="eyebrow">Simple to add</p>
            <h2
              id="code-title"
              className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl"
            >
              About thirty lines to start
            </h2>
            <p className="mt-4 leading-relaxed text-muted">
              Mount one route on your server and wrap your app in one provider. Start with a fake
              model, so you need no account and no keys. Swap in a real model when you are ready.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs/quickstart" className="btn btn-primary">
                Read the quickstart
              </Link>
              <Link href="/docs/ai-setup" className="btn btn-ghost">
                Let an AI set it up
              </Link>
            </div>
          </div>
          <div className="reveal min-w-0">
            <CodeTabs tabs={tabs} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="features-title">
        <div className="reveal mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">Everything you need</p>
          <h2
            id="features-title"
            className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl"
          >
            Built to be safe by default
          </h2>
        </div>
        <ul className="grid gap-4 md:grid-cols-4">
          {features.map((f, i) => (
            <li
              key={f.title}
              className={`reveal card glow-card p-6 ${f.span ?? ""}`}
              style={{ transitionDelay: `${(i % 4) * 70}ms` }}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <f.icon />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Privacy */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="privacy-title">
        <div className="reveal card relative overflow-hidden p-8 sm:p-12">
          <div className="aurora !opacity-30" aria-hidden="true" />
          <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <p className="eyebrow">Privacy first</p>
              <h2
                id="privacy-title"
                className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl"
              >
                We never see your visitors’ words
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                There is no speeq cloud. Conversations live in your database. Optional usage
                counters are anonymous, go only to a dashboard you run, and are off until you set an
                address.
              </p>
              <Link
                href="/docs/concepts/privacy"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
              >
                What is and is never collected <ArrowIcon width={16} height={16} />
              </Link>
            </div>
            <ul className="grid gap-2 text-sm">
              {[
                "Your data stays in your database",
                "Your model provider, your choice",
                "Changes always need a Yes",
                "No cookies or trackers on this site",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-line bg-elev/60 px-4 py-3 text-fg backdrop-blur"
                >
                  <ShieldIcon width={18} height={18} className="shrink-0 text-ok" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Packages + adoption */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="pkg-title">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow">Adoption</p>
          <h2 id="pkg-title" className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Ten small packages, one install
          </h2>
          <p className="mt-3 text-muted">Live from npm and GitHub. Updated about once an hour.</p>
        </div>
        <div className="reveal mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Installs, last week", formatCount(speeq?.week)],
            ["Installs, all time", formatCount(stats.speeqAllTime)],
            ["GitHub stars", formatCount(stats.github?.stars)],
            ["Latest version", speeq?.version ?? "–"],
          ].map(([label, value]) => (
            <div key={label} className="card p-5">
              <p className="text-sm text-muted">{label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-fg tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
        <ul className="reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.packages.map((p) => (
            <li key={p.name} className="card px-4 py-3">
              <p className="truncate font-mono text-[0.78rem] font-semibold text-fg">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted">{p.version ? `v${p.version}` : "–"}</p>
            </li>
          ))}
        </ul>
        <p className="reveal mt-6 text-center">
          <Link
            href="/stats"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
          >
            See all numbers <ArrowIcon width={16} height={16} />
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="container-x pb-8">
        <div className="reveal noise relative isolate overflow-hidden rounded-[2rem] border border-line-strong px-6 py-16 text-center sm:py-20">
          <div className="aurora" aria-hidden="true" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-bold tracking-tight text-fg sm:text-5xl">
            Ready to let your site <span className="gradient-text">talk back?</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-muted">
            Install it, mount one route, and say hello in five minutes.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/docs/quickstart" className="btn btn-primary w-full sm:w-auto">
              Get started
            </Link>
            <CopyCommand command={INSTALL_COMMAND} />
          </div>
        </div>
      </section>
    </main>
  );
}
