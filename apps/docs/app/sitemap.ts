import type { MetadataRoute } from "next";
import { flatNav } from "../content/nav";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/stats`, changeFrequency: "daily", priority: 0.6 },
    ...flatNav.map((page) => ({
      url: `${base}/docs/${page.slug}`,
      changeFrequency: "weekly" as const,
      priority: page.slug === "quickstart" || page.slug === "introduction" ? 0.9 : 0.7,
    })),
  ];
}
