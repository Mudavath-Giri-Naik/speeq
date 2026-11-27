import { z } from "zod";
const F = z.object({ a: z.string() }).refine(() => true);
export default async function Page({ searchParams }) {
  F.parse(await searchParams);
  return null;
}
