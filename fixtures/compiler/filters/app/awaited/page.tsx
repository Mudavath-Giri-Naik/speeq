import { z } from "zod";
const F = z.object({ page: z.coerce.number().optional() });
export default async function Page(props: { searchParams: Promise<unknown> }) {
  const sp = await props.searchParams;
  const f = F.safeParse(sp);
  return null;
}
