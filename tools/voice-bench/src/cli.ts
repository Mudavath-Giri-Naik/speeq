import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Manifest } from "./metrics.js";
import { markdown, type Row, report } from "./report.js";

const names = [
  "provider",
  "base-url",
  "model",
  "manifest",
  "language",
  "runs",
  "concurrency",
  "out",
  "voice",
  "sentences",
  "results",
  "from-tsv",
  "audio-dir",
  "license",
  "count",
  "network-note",
];
const {
  values,
  positionals: [cmd, source],
} = parseArgs({
  allowPositionals: true,
  options: {
    ...Object.fromEntries(names.map((n) => [n, { type: "string" as const }])),
    help: { type: "boolean" },
    "strip-zwj": { type: "boolean" },
  },
});
const opt = (n: string) => (typeof values[n] === "string" ? String(values[n]) : undefined);
function need(n: string) {
  const v = opt(n);
  if (!v) throw Error(`Missing --${n}`);
  return v;
}
function integer(n: string) {
  const v = Number(opt(n) ?? 1);
  if (!Number.isSafeInteger(v) || v < 1) throw Error(`Invalid --${n}`);
  return v;
}
const file = (p: string) => readFile(p, "utf8");
async function main() {
  if (values.help) {
    console.log(
      "bench score --results hypotheses.json --manifest corpus.json [--out reports/] [--strip-zwj]\nbench stt --provider openai-compatible --base-url URL --model NAME --manifest FILE\nbench tts --provider openai-compatible --base-url URL --model NAME --voice ID --sentences FILE\nbench manifest --from-tsv FILE --audio-dir DIR --language TAG --license LICENSE\nbench fetch fleurs --language te_in --count 50",
    );
    return;
  }
  if (cmd === "fetch" && source === "fleurs") {
    throw Error(
      "Download the selected language split from https://huggingface.co/datasets/google/fleurs, extract its WAV files, and save id<TAB>reference rows matching the WAV filenames. Run bench manifest with --from-tsv, --audio-dir, --language and --license CC-BY-4.0.",
    );
  }
  const out = resolve(opt("out") ?? "reports");
  await mkdir(out, { recursive: true });
  if (cmd === "manifest") {
    const items = (await file(need("from-tsv")))
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [id, reference] = line.split("\t");
        return {
          id,
          reference,
          language: need("language"),
          audio: relative(out, resolve(need("audio-dir"), `${id}.wav`)),
        };
      });
    await writeFile(
      join(out, "manifest.json"),
      JSON.stringify(
        Manifest.parse({ name: need("language"), license: need("license"), items }),
        null,
        2,
      ),
    );
    return;
  }
  const rows: Row[] = [];
  const jobs: (() => Promise<void>)[] = [];
  const runs = integer("runs"),
    concurrency = integer("concurrency"),
    language = opt("language");
  const model = opt("model"),
    url = opt("base-url"),
    provider = cmd === "score" ? "external" : need("provider");
  if (cmd !== "score" && provider !== "openai-compatible") throw Error("Unsupported provider");
  const config = () => ({
    baseURL: need("base-url"),
    model: need("model"),
    kind: "self-hosted" as const,
    apiKey: process.env.VOICE_BENCH_API_KEY,
  });
  if (cmd === "tts") {
    const { createOpenAICompatibleTts } = await import("@speeq/speech");
    const tts = createOpenAICompatibleTts({ ...config(), voices: [], defaultVoice: need("voice") });
    for (const text of (await file(need("sentences"))).split(/\r?\n/).filter(Boolean))
      jobs.push(async () => {
        const row: Row = { language: language ?? "und" };
        rows.push(row);
        const start = performance.now();
        try {
          const r = await tts.synthesize({ text, language: row.language });
          const reader = r.audio.getReader();
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            row.firstByteMs ??= performance.now() - start;
          }
          row.ms = performance.now() - start;
        } catch (e) {
          row.error = errorCode(e);
        }
      });
  } else if (cmd === "stt" || cmd === "score") {
    const path = need("manifest");
    const manifest = Manifest.parse(JSON.parse(await file(path)));
    const hypotheses =
      cmd === "score"
        ? z.record(z.string(), z.string()).parse(JSON.parse(await file(need("results"))))
        : undefined;
    const stt =
      cmd === "stt"
        ? (await import("@speeq/speech")).createOpenAICompatibleStt(config())
        : undefined;
    for (const item of manifest.items.filter((i) => !language || i.language === language))
      jobs.push(async () => {
        const row = { ...item } as Row;
        rows.push(row);
        if (hypotheses) {
          if (Object.hasOwn(hypotheses, item.id)) row.text = hypotheses[item.id];
          else row.error = "MISSING";
          return;
        }
        if (!stt) return;
        const audio = await readFile(resolve(dirname(path), item.audio));
        try {
          const result = await stt.transcribe({
            audio,
            mimeType: "audio/wav",
            language: item.language,
          });
          row.text = result.text;
          row.ms = result.providerMs;
        } catch (e) {
          row.error = errorCode(e);
        }
      });
  } else throw Error("Unknown command. Run with --help.");
  const queue = Array.from({ length: runs }, () => jobs).flat();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (;;) {
        const job = queue[next++];
        if (!job) return;
        await job();
      }
    }),
  );
  const r = report(rows, {
    provider,
    model,
    host: url ? new URL(url).host : undefined,
    runs,
    concurrency,
    networkNote: opt("network-note"),
    strip: values["strip-zwj"] === true,
  });
  await writeFile(join(out, "report.json"), JSON.stringify(r, null, 2));
  await writeFile(join(out, "report.md"), markdown(r));
}
function errorCode(e: unknown) {
  return typeof e === "object" && e && "code" in e ? String(e.code) : "PROVIDER_ERROR";
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
