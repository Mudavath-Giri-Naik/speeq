import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ControlState } from "./state.js";

/** Outcome of {@link checkMongo}. Messages never contain the URI or credentials. */
export type MongoCheck = { ok: true; ms: number } | { ok: false; message: string };

interface MongoModule {
  MongoClient: {
    connect(
      uri: string,
      options: { serverSelectionTimeoutMS: number },
    ): Promise<{
      db(name?: string): {
        command(c: Record<string, unknown>): Promise<unknown>;
        collection(n: string): {
          insertOne(d: Record<string, unknown>): Promise<unknown>;
          deleteOne(f: Record<string, unknown>): Promise<unknown>;
        };
      };
      close(): Promise<void>;
    }>;
  };
}

/** Load `mongodb` from the app's own dependencies (speeq does not ship a driver). */
async function driver(root: string): Promise<MongoModule | undefined> {
  try {
    const req = createRequire(join(root, "package.json"));
    return (await import(pathToFileURL(req.resolve("mongodb")).href)) as MongoModule;
  } catch {
    return undefined;
  }
}

/** Removes anything URI- or credential-like from a driver message. */
export function scrubMongo(message: string, uri: string): string {
  let out = message.split(uri).join("[uri]");
  out = out
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, "[uri]")
    .replace(/\/\/[^@\s/]+@/g, "//[credentials]@");
  return out.slice(0, 160);
}

/**
 * Connects with the app's own driver, pings, writes one document to `speeq_probe` and deletes it.
 * Reads no other collection and changes nothing else. Asks before installing the driver.
 */
export async function checkMongo(
  st: ControlState,
  uri: string,
  db: string | undefined,
): Promise<MongoCheck> {
  let mod = await driver(st.root);
  if (!mod) {
    const pm = st.loaded?.manifest.project.packageManager ?? "npm";
    const cmd = pm === "unknown" ? "npm" : pm;
    const install = st.ctx.env.exec
      ? await st.ctx.env.prompts?.confirm(
          `The mongodb driver is not installed in your app. Install it now? (${cmd} ${cmd === "npm" ? "install" : "add"} mongodb)`,
          true,
        )
      : false;
    if (!install || !st.ctx.env.exec)
      return {
        ok: false,
        message: "the mongodb package is not installed in your app (add it, then check again)",
      };
    const code = await st.ctx.env.exec(
      cmd,
      [cmd === "npm" ? "install" : "add", "mongodb"],
      st.root,
    );
    if (code !== 0) return { ok: false, message: `${cmd} could not install mongodb` };
    mod = await driver(st.root);
    if (!mod) return { ok: false, message: "mongodb was installed but could not be loaded" };
  }
  const started = Date.now();
  let client: Awaited<ReturnType<MongoModule["MongoClient"]["connect"]>> | undefined;
  try {
    client = await mod.MongoClient.connect(uri, { serverSelectionTimeoutMS: 6000 });
    const database = client.db(db);
    await database.command({ ping: 1 });
    const probe = database.collection("speeq_probe");
    const id = `speeq-probe-${started}-${Math.random().toString(36).slice(2, 8)}`;
    await probe.insertOne({ _id: id, at: new Date().toISOString() });
    await probe.deleteOne({ _id: id });
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const hint = /auth/i.test(raw)
      ? "the user name or password was rejected"
      : /not authorized|unauthorized/i.test(raw)
        ? "the user cannot write to this database"
        : /ENOTFOUND|getaddrinfo|querySrv/i.test(raw)
          ? "the host was not found"
          : /timed out|Server selection/i.test(raw)
            ? "the server did not answer (check network access or IP allow lists)"
            : scrubMongo(raw, uri);
    return { ok: false, message: hint };
  } finally {
    await client?.close().catch(() => undefined);
  }
}
