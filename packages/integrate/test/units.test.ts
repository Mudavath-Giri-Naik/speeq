import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSecretName,
  memoryFs,
  nodeFs,
  ownership,
  PROVIDERS,
  renderZod,
  seal,
} from "../src/index.js";

describe("ownership", () => {
  it("distinguishes missing, owned, edited and foreign", () => {
    const text = seal("export const a = 1;\n");
    expect(ownership(undefined)).toBe("missing");
    expect(ownership(text)).toBe("owned");
    expect(ownership(`${text}// more\n`)).toBe("edited");
    expect(ownership("export const a = 1;\n")).toBe("foreign");
    expect(ownership(text.replace(/^[^\n]*\n/, "// speeq:generated sha256=abc\n"))).toBe("foreign");
  });
  it("seal is stable", () => {
    expect(seal("x")).toBe(seal("x\n"));
  });
});

describe("renderZod", () => {
  it("renders the supported subset", () => {
    const r = renderZod({
      type: "object",
      required: ["name", "n"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 20, description: 'say "hi"' },
        n: { type: "integer", minimum: 1, maximum: 5 },
        tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, maxItems: 3 },
        mail: { type: "string", format: "email" },
        mode: { enum: [1, 2] },
        either: { anyOf: [{ type: "string" }, { type: "null" }] },
        flag: { type: "boolean", default: false },
      },
    });
    expect(r.ok).toBe(true);
    const code = r.ok ? r.code : "";
    expect(code).toContain("z.strictObject(");
    expect(code).toContain('"name": z.string().min(1).max(20).describe("say \\"hi\\"")');
    expect(code).toContain('"n": z.int().min(1).max(5)');
    expect(code).toContain('"tags": z.array(z.enum(["a", "b"])).max(3).optional()');
    expect(code).toContain('"mail": z.email().optional()');
    expect(code).toContain("z.union([z.literal(1), z.literal(2)])");
    expect(code).toContain('"flag": z.boolean().default(false)');
  });
  it.each([
    [{ type: "object", properties: { password: { type: "string" } } }, /secret/],
    [{ type: "object", properties: { cardNumber: { type: "string" } } }, /secret/],
    [{ type: "object", properties: { x: {} } }, /no recognised type/],
    [{ type: "array" }, /no item schema/],
    [{ type: "string", pattern: "(" }, /regular expression/],
    [{ enum: [] }, /empty/],
    [{ enum: [{ a: 1 }] }, /non-primitive/],
  ] as const)("refuses %j", (schema, reason) => {
    const r = renderZod(schema as never);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.reason).toMatch(reason);
  });
  it("refuses very deep schemas", () => {
    let s: object = { type: "string" };
    for (let i = 0; i < 12; i++) s = { type: "array", items: s };
    expect(renderZod(s as never).ok).toBe(false);
  });
  it("never embeds injected text as code", () => {
    const r = renderZod({
      type: "object",
      properties: { 'a"});process.exit(1);//': { type: "string" } },
    });
    expect(r.ok ? r.code : "").toContain(JSON.stringify('a"});process.exit(1);//'));
  });
  it("recognises secret-looking names", () => {
    for (const n of [
      "password",
      "apiKey",
      "api_key",
      "authToken",
      "cvv",
      "OTP",
      "creditCard",
      "pin",
    ])
      expect(isSecretName(n)).toBe(true);
    for (const n of ["name", "tokenizer", "pinned", "cardinality", "email"])
      expect(isSecretName(n)).toBe(false);
  });
});

describe("file systems", () => {
  it("memoryFs and nodeFs reject unsafe paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "speeq-fs-"));
    try {
      for (const fs of [memoryFs(), nodeFs(dir)])
        for (const p of ["../x", "/abs", "a/../b", "a\\b", "", "a//b", "C:/x"])
          await expect(fs.write(p, "x")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("nodeFs writes atomically, lists and prunes empty folders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "speeq-fs-"));
    try {
      const fs = nodeFs(dir);
      await fs.write("a/b/c.txt", "1");
      expect(await fs.read("a/b/c.txt")).toBe("1");
      expect(await fs.list("a")).toEqual(["b"]);
      await fs.remove("a/b/c.txt");
      expect(await fs.list("a")).toEqual([]);
      expect(await fs.read("a/b/c.txt")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("nodeFs refuses to write through a symlink that leaves the root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "speeq-fs-"));
    const outside = await mkdtemp(join(tmpdir(), "speeq-out-"));
    try {
      await writeFile(join(outside, "f.txt"), "x");
      try {
        await symlink(outside, join(dir, "link"), "junction");
      } catch {
        return; // symlinks unavailable on this machine
      }
      await expect(nodeFs(dir).write("link/new.txt", "x")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("registry", () => {
  it("mock mode needs no key and no env", () => {
    const mock = PROVIDERS.find((p) => p.id === "mock");
    expect(mock).toMatchObject({ needsKey: false, env: [] });
    expect(PROVIDERS[0]?.id).toBe("mock");
  });
  it("no provider hard-codes a model id", () => {
    for (const p of PROVIDERS) expect(p.expression).not.toMatch(/gpt-|gemini-\d|llama|claude/i);
  });
});
