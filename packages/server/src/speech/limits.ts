import { SpeeqError } from "@speeq/core";
/** Read a bounded upload, cancelling its producer immediately on overflow. */
export async function readAudio(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) {
    void request.body?.cancel().catch(() => {});
    throw new SpeeqError("PAYLOAD_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SpeeqError("INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        void reader.cancel().catch(() => {});
        throw new SpeeqError("PAYLOAD_TOO_LARGE");
      }
      if (value.length) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new SpeeqError("INVALID_INPUT");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
