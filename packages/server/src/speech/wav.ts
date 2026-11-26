import { SpeeqError } from "@speeq/core";
/** Measure PCM16 WAV duration and normalized RMS without allocating decoded audio. */
export function measureWav(bytes: Uint8Array) {
  const invalid = () => new SpeeqError("INVALID_INPUT");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const tag = (i: number) => String.fromCharCode(...bytes.subarray(i, i + 4));
  if (
    bytes.length < 44 ||
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    v.getUint32(4, true) + 8 !== bytes.length
  )
    throw invalid();
  let rate = 0,
    channels = 0,
    data = -1,
    size = 0;
  for (let i = 12; i + 8 <= bytes.length; ) {
    const name = tag(i),
      n = v.getUint32(i + 4, true);
    i += 8;
    if (i + n > bytes.length) throw invalid();
    if (name === "fmt ") {
      if (n < 16 || v.getUint16(i, true) !== 1 || v.getUint16(i + 14, true) !== 16) throw invalid();
      channels = v.getUint16(i + 2, true);
      rate = v.getUint32(i + 4, true);
    }
    if (name === "data") {
      if (data >= 0) throw invalid();
      data = i;
      size = n;
    }
    i += n + (n % 2);
  }
  if (!rate || !channels || data < 0 || !size || size % (2 * channels)) throw invalid();
  let power = 0;
  for (let i = data; i < data + size; i += 2) power += (v.getInt16(i, true) / 32768) ** 2;
  return { audioMs: (1000 * size) / (2 * rate * channels), rms: Math.sqrt(power / (size / 2)) };
}
