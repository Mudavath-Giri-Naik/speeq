import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon } from "../../../components/icons";
import { Toc } from "../../../components/toc";
import { findNav, neighbours } from "../../../content/nav";
import { getDoc, markdownSlugs } from "../../../lib/content";
import { REPO_URL } from "../../../lib/site";

type Params = { slug: string[] };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return markdownSlugs().map((slug) => ({ slug: slug.split("/") }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDoc(slug.join("/"));
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: { title: doc.title, description: doc.description, type: "article" },
  };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const doc = await getDoc(slug);
  if (!doc) notFound();
  const where = findNav(slug);
  const { prev, next } = neighbours(slug);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
      <article className="min-w-0 max-w-[46rem]">
        {where && <p className="eyebrow mb-3">{where.section.title}</p>}
        <div className="prose-docs">
          <h1>{doc.title}</h1>
        </div>
        <div className="mt-5">
          <Toc headings={doc.headings} variant="inline" />
        </div>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is produced from our own markdown with raw HTML disabled */}
        <div className="prose-docs" dangerouslySetInnerHTML={{ __html: doc.html }} />

        <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-sm text-muted">
          <a
            href={`${REPO_URL}/edit/main/apps/docs/${doc.file}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg"
          >
            Edit this page on GitHub
          </a>
          <a href={`/docs/raw/${doc.slug}.md`} className="hover:text-fg">
            View as Markdown
          </a>
        </div>

        <nav aria-label="Previous and next" className="mt-8 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group rounded-2xl border border-line p-4 transition hover:border-accent"
            >
              <span className="text-xs text-muted">Previous</span>
              <span className="mt-1 flex items-center gap-2 font-medium text-fg">
                <ArrowIcon
                  className="rotate-180 text-muted transition group-hover:-translate-x-0.5"
                  width={16}
                  height={16}
                />
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="group rounded-2xl border border-line p-4 text-right transition hover:border-accent sm:col-start-2"
            >
              <span className="text-xs text-muted">Next</span>
              <span className="mt-1 flex items-center justify-end gap-2 font-medium text-fg">
                {next.title}
                <ArrowIcon
                  className="text-muted transition group-hover:translate-x-0.5"
                  width={16}
                  height={16}
                />
              </span>
            </Link>
          )}
        </nav>
      </article>
      <Toc headings={doc.headings} variant="side" />
    </div>
  );
}
