const KEY = "x" + Math.random();
export async function POST(req: Request) { return Response.json(new URL(req.url).searchParams.get(KEY)); }
