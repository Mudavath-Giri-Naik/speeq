import Link from "next/link";
import { CodeTabs } from "../components/home/code-tabs";
import { CopyCommand } from "../components/home/copy-command";
import { AskAssistantButton, PrimaryCta } from "../components/home/cta-buttons";
import { CtaPanel } from "../components/home/cta-panel";
import { Demo } from "../components/home/demo";
import { HeroFan } from "../components/home/hero-fan";
import { HowBeams } from "../components/home/how-beams";
import { CountUp, Reveal, SplitHeading } from "../components/home/motion";
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
import { getSiteStats } from "../lib/stats";

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
    span: "md:col-span-2",
  },
  {
    icon: BoltIcon,
    title: "Works with Next.js today",
    text: "A ready adapter, React hooks, and a five minute quickstart with no keys.",
    span: "md:col-span-2",
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

  // Show real numbers only. A brand new package has no download or star counts yet, and a big
  // "0" reads worse than a fact that is always true.
  const highlights: Array<{ label: string; value: number | string }> = [
    ...(speeq?.week ? [{ label: "Installs, last week", value: speeq.week }] : []),
    ...(stats.github?.stars ? [{ label: "GitHub stars", value: stats.github.stars }] : []),
    { label: "Packages, one install", value: stats.packages.length || 10 },
    { label: "Latest version", value: speeq?.version ?? "–" },
    { label: "License", value: "MIT" },
    { label: "Cookies or trackers", value: "None" },
  ].slice(0, 4);

  return (
    <main className="overflow-x-clip">
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(jsonLd)}
      </script>

      {/* Hero */}
      <section className="relative isolate min-h-[max(40rem,calc(100svh-4rem))] overflow-hidden pt-8 pb-[clamp(8rem,24vw,23rem)] sm:pt-12">
        <div className="aurora" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0" aria-hidden="true">
          <HeroFan />
        </div>
        <div className="container-x relative z-10 text-center">
          <Reveal immediate y={12}>
            <Link
              href="/docs/releases"
              className="mx-auto inline-flex items-center gap-2 rounded-full border border-line-strong bg-elev/70 py-1.5 pr-3 pl-1.5 text-xs text-soft backdrop-blur transition hover:border-accent"
            >
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-white">
                New
              </span>
              speeq {speeq?.version ?? "0.2"} is on npm
              <ArrowIcon width={14} height={14} />
            </Link>
          </Reveal>
          <SplitHeading
            text="Give your website| a voice."
            accent={["voice."]}
            accentClass="hero-accent"
            delay={0.1}
            className="hero-title mx-auto mt-6 max-w-5xl text-[clamp(2.6rem,7.6vw,5.4rem)] leading-[0.98] font-extrabold text-fg"
          />
          <Reveal immediate delay={0.55} y={16}>
            <p className="mx-auto mt-6 max-w-xl text-[clamp(1rem,1.9vw,1.2rem)] leading-relaxed text-muted">
              speeq is a voice and text assistant that you add to your own app. It talks, opens
              pages, and answers using your data, with your model and your design.
            </p>
          </Reveal>
          <Reveal immediate delay={0.7} y={16}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta href="/docs/quickstart">Get started</PrimaryCta>
              <CopyCommand command={INSTALL_COMMAND} />
            </div>
            <p className="mt-5 text-sm text-muted">
              Want to hear it first?{" "}
              <AskAssistantButton>Talk to the speeq guide</AskAssistantButton>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Numbers */}
      <section className="container-x pb-6 sm:pb-12" aria-label="speeq in numbers">
        <Reveal>
          <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.label} className="bg-elev px-4 py-6 text-center">
                <dd className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-fg tabular-nums sm:text-4xl">
                  {typeof item.value === "number" ? <CountUp value={item.value} /> : item.value}
                </dd>
                <dt className="mt-1 text-xs text-muted sm:text-sm">{item.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="container-x py-16 sm:py-24" aria-labelledby="how-title">
        <div className="mx-auto mb-4 max-w-2xl text-center">
          <Reveal>
            <p className="eyebrow">How it works</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              id="how-title"
              className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
            >
              Three steps, all on <span className="gradient-text">your side</span>
            </h2>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <HowBeams />
        </Reveal>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <Reveal key={step.n} as="li" delay={i * 0.1} className="card glow-card p-6">
              <span className="gradient-text font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tighter">
                {step.n}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-fg">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </Reveal>
          ))}
        </ol>
        <Reveal>
          <p className="mt-8 text-center text-sm text-muted">
            Your visitor’s messages go to your server and your model. They never go to speeq.{" "}
            <Link href="/docs/concepts/how-it-works" className="text-accent hover:underline">
              Read how it works
            </Link>
          </p>
        </Reveal>
      </section>

      {/* Demo */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="demo-title">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Reveal>
            <p className="eyebrow">See it work</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              id="demo-title"
              className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
            >
              Try the assistant right here
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-4 text-muted">
              This is a small simulation of what your visitors would see. Ask it to open a page,
              find an order, or cancel one. It will ask before it changes anything.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.1} y={40}>
          <Demo />
        </Reveal>
      </section>

      {/* Code */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="code-title">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Reveal>
              <p className="eyebrow">Simple to add</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2
                id="code-title"
                className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
              >
                About thirty lines to start
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
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
            </Reveal>
          </div>
          <Reveal delay={0.1} className="min-w-0">
            <CodeTabs tabs={tabs} />
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="features-title">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Reveal>
            <p className="eyebrow">Everything you need</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              id="features-title"
              className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
            >
              Built to be <span className="gradient-text">safe by default</span>
            </h2>
          </Reveal>
        </div>
        <ul className="grid gap-4 md:grid-cols-4">
          {features.map((f, i) => (
            <Reveal
              key={f.title}
              as="li"
              delay={(i % 4) * 0.07}
              className={`card glow-card group p-6 transition-transform duration-500 hover:-translate-y-1.5 ${f.span ?? ""}`}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent ring-1 ring-accent/25 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                <f.icon />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Privacy */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="privacy-title">
        <Reveal>
          <div className="card relative overflow-hidden p-8 sm:p-12">
            <div className="aurora !opacity-30" aria-hidden="true" />
            <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
              <div>
                <p className="eyebrow">Privacy first</p>
                <h2
                  id="privacy-title"
                  className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
                >
                  We never see your visitors’ words
                </h2>
                <p className="mt-4 leading-relaxed text-muted">
                  There is no speeq cloud. Conversations live in your database. Optional usage
                  counters are anonymous, go only to a dashboard you run, and are off until you set
                  an address.
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
                ].map((item, i) => (
                  <Reveal
                    key={item}
                    as="li"
                    delay={i * 0.08}
                    className="flex items-center gap-3 rounded-xl border border-line bg-elev/60 px-4 py-3 text-fg backdrop-blur"
                  >
                    <ShieldIcon width={18} height={18} className="shrink-0 text-ok" />
                    {item}
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Packages + adoption */}
      <section className="container-x py-12 sm:py-20" aria-labelledby="pkg-title">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Reveal>
            <p className="eyebrow">Adoption</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              id="pkg-title"
              className="mt-3 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-fg sm:text-5xl"
            >
              Ten small packages, one install
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 text-muted">Live from npm and GitHub. Updated about once an hour.</p>
          </Reveal>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Installs, last week", value: speeq?.week ?? null },
            { label: "Installs, all time", value: stats.speeqAllTime ?? null },
            { label: "GitHub stars", value: stats.github?.stars ?? null },
          ].map((item, i) => (
            <Reveal key={item.label} delay={i * 0.07} className="card p-5">
              <p className="text-sm text-muted">{item.label}</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-fg tabular-nums">
                <CountUp value={item.value} />
              </p>
            </Reveal>
          ))}
          <Reveal delay={0.21} className="card p-5">
            <p className="text-sm text-muted">Latest version</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-fg">
              {speeq?.version ?? "–"}
            </p>
          </Reveal>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.packages.map((p, i) => (
            <Reveal
              key={p.name}
              as="li"
              delay={(i % 5) * 0.05}
              className="card px-4 py-3 transition-transform duration-300 hover:-translate-y-1"
            >
              <p className="truncate font-mono text-[0.78rem] font-semibold text-fg">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted">{p.version ? `v${p.version}` : "–"}</p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-center">
          <Link
            href="/stats"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
          >
            See all numbers <ArrowIcon width={16} height={16} />
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="container-x pb-10">
        <CtaPanel command={INSTALL_COMMAND} />
      </section>
    </main>
  );
}
