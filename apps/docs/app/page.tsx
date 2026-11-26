import { Architecture } from "@/components/home/architecture";
import { Capabilities } from "@/components/home/capabilities";
import { Community } from "@/components/home/community";
import { Compare } from "@/components/home/compare";
import { Discovery } from "@/components/home/discovery";
import { Engineering } from "@/components/home/engineering";
import { Faq } from "@/components/home/faq";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { Integrate } from "@/components/home/integrate";
import { Intelligence } from "@/components/home/intelligence";
import { Em, Section, SectionHead } from "@/components/home/kit";
import { Packages } from "@/components/home/packages";
import { Proactive } from "@/components/home/proactive";
import { ProductDemo } from "@/components/home/product-demo";
import { Quickstart } from "@/components/home/quickstart";
import { Security } from "@/components/home/security";
import { Showcase } from "@/components/home/showcase";
import { Stack } from "@/components/home/stack";
import { Transformation } from "@/components/home/transformation";
import { UseCases } from "@/components/home/use-cases";
import { getQuickstartTabs } from "@/lib/home-code";
import { REPO_URL, siteUrl } from "@/lib/site";
import { getSiteStats } from "@/lib/stats";

export const revalidate = 3600;

export default async function Home() {
  const [stats, tabs] = await Promise.all([getSiteStats(), getQuickstartTabs()]);
  const speeq = stats.packages.find((p) => p.name === "speeq");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "speeq",
    description:
      "An open-source, headless SDK for voice, text, application actions and context-aware interactions.",
    codeRepository: REPO_URL,
    programmingLanguage: "TypeScript",
    license: "https://opensource.org/license/mit",
    url: siteUrl(),
  };

  return (
    <main className="overflow-x-clip">
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(jsonLd)}
      </script>
      <Hero version={speeq?.version ?? null} />

      <Section id="demo">
        <SectionHead
          id="demo"
          eyebrow="Intent to action"
          title={
            <>
              A request goes in. <Em>Your app</Em> responds.
            </>
          }
          lede="Pick an industry and watch the same path every time: the visitor asks, speeq selects an approved capability, your existing service runs, and your own interface updates."
        />
        <ProductDemo />
      </Section>

      <Stack />
      <Transformation />
      <Compare />
      <Architecture />
      <Capabilities />
      <Discovery />
      <Integrate />
      <Quickstart tabs={tabs} />
      <Intelligence />
      <UseCases />
      <Proactive />
      <Security />
      <Engineering packageCount={stats.packages.length || 10} />
      <Packages packages={stats.packages} />
      <Showcase />
      <Community stats={stats} />
      <Faq />
      <FinalCta />
    </main>
  );
}
