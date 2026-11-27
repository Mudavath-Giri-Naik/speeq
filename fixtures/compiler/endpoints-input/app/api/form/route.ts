export async function POST(req: Request) { const f = await req.formData(); return Response.json({ f }); }
