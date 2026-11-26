type Frame = (samples: Float32Array, rate: number) => void;
/** Fixed-capacity mono pre-roll, returned oldest first. */
export class PreRoll {
  private buffer: Float32Array;
  private cursor = 0;
  private count = 0;
  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }
  push(samples: Float32Array) {
    for (const sample of samples) {
      this.buffer[this.cursor] = sample;
      this.cursor = (this.cursor + 1) % this.buffer.length;
    }
    this.count = Math.min(this.count + samples.length, this.buffer.length);
  }
  take() {
    const out = new Float32Array(this.count);
    for (let i = 0; i < out.length; i++)
      out[i] =
        this.buffer[(this.cursor - this.count + i + this.buffer.length) % this.buffer.length] ?? 0;
    this.count = 0;
    return out;
  }
}
const moduleSource = `class Capture extends AudioWorkletProcessor {
 process(inputs){const mono=inputs[0][0];if(mono)this.port.postMessage(mono);return true;}
} registerProcessor("speeq-capture",Capture);`;
/** Open a mono capture graph. Abort releases tracks even during asynchronous setup. */
export async function openCapture(frame: Frame, signal: AbortSignal) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let ctx: AudioContext | undefined;
  const close = () => {
    for (const t of stream.getTracks()) t.stop();
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    signal.throwIfAborted();
    ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream),
      rate = ctx.sampleRate;
    let node: AudioWorkletNode | ScriptProcessorNode;
    try {
      const url = URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      node = new AudioWorkletNode(ctx, "speeq-capture", {
        channelCount: 1,
        channelCountMode: "explicit",
      });
      node.port.onmessage = (e) => {
        if (!signal.aborted) frame(e.data, rate);
      };
    } catch {
      signal.throwIfAborted();
      node = ctx.createScriptProcessor(1024, 1, 1);
      node.onaudioprocess = (e) => {
        if (!signal.aborted) frame(e.inputBuffer.getChannelData(0).slice(), rate);
      };
    }
    signal.throwIfAborted();
    source.connect(node);
    node.connect(ctx.destination);
  } catch (e) {
    signal.removeEventListener("abort", close);
    close();
    throw e;
  }
}
