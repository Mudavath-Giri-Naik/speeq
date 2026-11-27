import { z } from "zod";
const Body = z.object({ q: z.string() });
export async function POST(req: Request) { const b = Body.parse(await req.json()); return Response.json(b); }
