/** Reports process health without opening a database connection. */
export function GET() {
  return Response.json({ ok: true });
}
