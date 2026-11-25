import { buildSearchIndex } from "../../lib/search-index";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(await buildSearchIndex(), {
    headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
