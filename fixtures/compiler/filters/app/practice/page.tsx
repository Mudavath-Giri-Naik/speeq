import { z } from "zod";
const Filters = z.object({ subject: z.enum(["math", "physics"]).optional(), q: z.string().max(100).optional() });
export default async function Page({ searchParams }: { searchParams: Promise<unknown> }) {
  const params = Filters.parse(await searchParams);
  return null;
}
