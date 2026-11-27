import { z } from "zod";
const Query = z.object({ page: z.coerce.number() });
export async function GET(req: Request) { const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams)); return Response.json(q); }
