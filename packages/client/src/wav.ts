/** Linearly resample a complete mono utterance to 16 kHz. */
export function resample(samples: Float32Array, rate: number) {
  if (rate === 16000) return samples;
  const out = new Float32Array(Math.round((samples.length * 16000) / rate));
  for (let i = 0; i < out.length; i++) {
    const pos = (i * rate) / 16000,
      index = Math.floor(pos),
      left = samples[index] ?? 0;
    out[i] = left + ((samples[index + 1] ?? left) - left) * (pos - index);
  }
  return out;
}
/** Encode mono samples as little-endian PCM16 WAV. */
export function encodeWav(samples: Float32Array) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const tag = (s: string, i: number) => bytes.set(new TextEncoder().encode(s), i);
  tag("RIFF", 0);
  view.setUint32(4, bytes.length - 8, true);
  tag("WAVEfmt ", 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag("data", 36);
  view.setUint32(40, bytes.length - 44, true);
  samples.forEach((s, i) =>
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767), true),
  );
  return bytes;
}
