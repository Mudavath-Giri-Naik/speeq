import { z } from "zod";
const P = z.object({ cardNumber: z.string() });
export async function POST(req: Request) { return Response.json(P.parse(await req.json())); }
