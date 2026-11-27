import type { RouteCapability } from "@speeq/core/manifest";
import type ts from "typescript";
import { type Draft, evidence, UNOBSERVED } from "../capability.js";
import { capabilityId } from "../ids.js";
import { docOf } from "../jsdoc.js";
import { tableOf } from "../ts/exports.js";
import { lineOf } from "../ts/parse.js";
import { literalMetadata } from "./metadata.js";
import { type Role, titleFromPath } from "./roles.js";
import { sensitivityOfPath } from "./sensitivity.js";

/** Build a navigable route capability from a `page` file. */
export function routeDraft(
  role: Extract<Role, { role: "page" }>,
  file: string,
  sf: ts.SourceFile,
): Draft<RouteCapability> {
  const table = tableOf(sf);
  const def = table.exports.get("default");
  const line = def ? lineOf(def.at) : 1;
  const local = def && "local" in def ? table.locals.get(def.local) : undefined;
  const meta = role.router === "app" ? literalMetadata(sf) : {};
  const description = meta.description ?? (local ? docOf(local).description : undefined);
  const review = role.dynamic === "catch-all" || role.dynamic === "optional-catch-all";
  return {
    id: capabilityId("route", role.path),
    kind: "route",
    title: meta.title ?? titleFromPath(role.path),
    ...(description ? { description } : {}),
    framework: role.router === "app" ? "nextjs-app" : "nextjs-pages",
    source: { file, line },
    evidence: [
      evidence(
        role.router === "app" ? "next-app-page" : "next-pages-page",
        file,
        line,
        role.router === "app" ? "App Router page file" : "Pages Router page file",
      ),
    ],
    support: review ? "needs-review" : "proven",
    ...(review
      ? {
          supportReason:
            "Catch-all segments cannot be filled by the navigation resolver, which fills single :name segments only.",
        }
      : {}),
    access: "read",
    sensitivity: sensitivityOfPath(role.path),
    auth: { ...UNOBSERVED, evidence: [] },
    related: [],
    path: role.path,
    pathPattern: role.pattern,
    dynamic: role.dynamic,
    pathParams: role.params,
    queryParams: [],
  };
}
