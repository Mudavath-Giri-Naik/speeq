import { getSiteStats } from "../../../lib/stats";

export const revalidate = 3600;

export async function GET() {
  const stats = await getSiteStats();
  return Response.json(stats, {
    headers: {
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  });
}
