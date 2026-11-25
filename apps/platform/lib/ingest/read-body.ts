/** Maximum accepted wire size. */
export const MAX_INGEST_BYTES = 65536;
/** Reads at most one bounded body and cancels an oversized stream immediately. */
export async function readBoundedBody(
  request: Request,
): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  if (Number(request.headers.get("content-length")) > MAX_INGEST_BYTES)
    return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INGEST_BYTES) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      text += decoder.decode(value, { stream: true });
    }
    return { ok: true, text: text + decoder.decode() };
  } finally {
    reader.releaseLock();
  }
}
