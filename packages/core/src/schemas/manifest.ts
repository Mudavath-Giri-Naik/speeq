import { z } from "zod";

/** Current on-disk manifest format. */
export const MANIFEST_VERSION = 1 as const;
/** Discovery categories. */
export const kindSchema = z.enum(["route", "endpoint", "function", "form", "filter-set"]);
/** Strength of scanner support. */
export const supportSchema = z.enum(["proven", "needs-review", "unsupported"]);
/** Effect on host data. */
export const accessSchema = z.enum(["read", "write", "unknown"]);
const sensitivity = z.enum(["none", "personal", "financial", "credentials", "admin", "unknown"]);
const framework = z.enum(["nextjs-app", "nextjs-pages"]);
/** A canonical, repo-relative source file. */
export const fileSchema = z
  .string()
  .min(1)
  .refine(
    (s) => !/[:\\\p{Cc}]/u.test(s) && s.split("/").every((v) => v && v !== "." && v !== ".."),
    "Expected a repo-relative POSIX file",
  );
const line = z.int().positive();
const source = z.strictObject({ file: fileSchema, line });
const evidence = source.extend({ detector: z.string().min(1), note: z.string().max(200) });
const auth = z.strictObject({
  observed: z.enum(["none-found", "present", "unknown"]),
  evidence: z.array(evidence),
});
/** Stable framework identity with a nonempty, printable key. */
export const idSchema = z.string().refine((s) => {
  const i = s.indexOf(":");
  const key = s.slice(i + 1);
  return (
    i > 0 &&
    kindSchema.safeParse(s.slice(0, i)).success &&
    key.length > 0 &&
    key.trim() === key &&
    !/[\p{Cc}\\]/u.test(key)
  );
}, "Invalid capability id");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const description = z
  .string()
  .transform((s) => s.replace(/\p{Cc}/gu, ""))
  .pipe(z.string().max(300));
const base = z.strictObject({
  id: idSchema,
  kind: kindSchema,
  title: z.string().max(80),
  description: description.optional(),
  framework,
  source,
  evidence: z.array(evidence).min(1),
  support: supportSchema,
  supportReason: z.string().trim().min(1).optional(),
  access: accessSchema,
  sensitivity,
  auth,
  fingerprint: digest,
  related: z.array(idSchema),
});
const schemaType = z.enum(["null", "boolean", "object", "array", "number", "integer", "string"]);
const jsonSchema = z.strictObject({
  type: schemaType.optional(),
  get properties(): z.ZodOptional<z.ZodRecord<z.ZodString, typeof jsonSchema>> {
    return z.record(z.string(), jsonSchema).optional();
  },
  required: z.array(z.string()).optional(),
  enum: z.array(z.json()).optional(),
  get items(): z.ZodOptional<typeof jsonSchema> {
    return jsonSchema.optional();
  },
  additionalProperties: z.boolean().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  exclusiveMinimum: z.number().optional(),
  exclusiveMaximum: z.number().optional(),
  minItems: z.int().nonnegative().optional(),
  maxItems: z.int().nonnegative().optional(),
  format: z.enum(["email", "uri", "uuid"]).optional(),
  minLength: z.int().nonnegative().optional(),
  maxLength: z.int().nonnegative().optional(),
  pattern: z.string().optional(),
  default: z.json().optional(),
  description: z.string().optional(),
  get anyOf(): z.ZodOptional<z.ZodArray<typeof jsonSchema>> {
    return z.array(jsonSchema).optional();
  },
});
const parameters = z.array(z.strictObject({ name: z.string(), schema: jsonSchema.optional() }));
const route = base.extend({
  kind: z.literal("route"),
  path: z.string(),
  pathPattern: z.string(),
  dynamic: z.enum(["static", "dynamic", "catch-all", "optional-catch-all"]),
  pathParams: z.array(z.string()),
  queryParams: parameters,
});
const endpoint = base.extend({
  kind: z.literal("endpoint"),
  path: z.string(),
  methods: z.array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])),
  input: z
    .strictObject({
      query: jsonSchema.optional(),
      body: jsonSchema.optional(),
      source: z.enum(["zod", "openapi", "none"]),
    })
    .optional(),
});
const fn = base.extend({
  kind: z.literal("function"),
  export: z.strictObject({ file: fileSchema, name: z.string(), isServerAction: z.boolean() }),
  input: z.strictObject({ schema: jsonSchema, source: z.enum(["zod", "none"]) }).optional(),
  validatesAtRuntime: z.boolean(),
});
const form = base.extend({
  kind: z.literal("form"),
  routeId: idSchema.optional(),
  fields: z.array(
    z.strictObject({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      sensitive: z.boolean(),
    }),
  ),
  actionRef: idSchema.optional(),
  runtimeBinding: z.literal("none"),
});
const filter = base.extend({
  kind: z.literal("filter-set"),
  routeId: idSchema.optional(),
  parameters,
});
const capability = z
  .discriminatedUnion("kind", [route, endpoint, fn, form, filter])
  .superRefine((c, ctx) => {
    if (!c.id.startsWith(`${c.kind}:`))
      ctx.addIssue({ code: "custom", path: ["id"], message: "Id kind differs" });
    if (c.support !== "proven" && !c.supportReason)
      ctx.addIssue({ code: "custom", path: ["supportReason"], message: "Expected support reason" });
    if (c.kind === "function" && !c.input && c.support === "proven")
      ctx.addIssue({
        code: "custom",
        path: ["support"],
        message: "Unspecified input needs review",
      });
  });
const diagnostic = z.strictObject({
  code: z.string().regex(/^SQ\d{4}$/),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().max(300),
  file: fileSchema.optional(),
  line: line.optional(),
});
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
/** Versioned discovery output. */
export const manifestSchema = z
  .strictObject({
    manifestVersion: z.literal(MANIFEST_VERSION),
    generator: z.strictObject({ name: z.literal("speeq"), version: z.string() }),
    project: z.strictObject({
      root: z.union([z.literal("."), fileSchema]),
      framework: z.enum([...framework.options, "unknown"]),
      packageManager: z.enum(["npm", "pnpm", "yarn", "bun", "unknown"]),
      appDir: fileSchema.optional(),
      language: z.enum(["typescript", "javascript", "mixed"]),
    }),
    capabilities: z.array(capability),
    diagnostics: z.array(diagnostic),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((m, ctx) => {
    m.capabilities.forEach((c, i) => {
      const prev = m.capabilities[i - 1];
      if (prev && prev.id >= c.id)
        ctx.addIssue({
          code: "custom",
          path: ["capabilities", i, "id"],
          message: "Ids must be unique and sorted",
        });
    });
    m.diagnostics.forEach((d, i) => {
      const p = m.diagnostics[i - 1];
      if (
        p &&
        (compare(p.file ?? "", d.file ?? "") ||
          (p.line ?? 0) - (d.line ?? 0) ||
          compare(p.code, d.code)) > 0
      )
        ctx.addIssue({
          code: "custom",
          path: ["diagnostics", i],
          message: "Diagnostics must be sorted by file, line and code",
        });
    });
  });
const decision = z
  .strictObject({
    review: z.enum(["approved", "disabled"]),
    approvedFingerprint: digest.optional(),
    access: z.enum(["read", "write"]).optional(),
    auth: z
      .strictObject({
        requirement: z.enum(["public", "authenticated", "roles"]),
        roles: z.array(z.string()).optional(),
      })
      .optional(),
    confirm: z.boolean().optional(),
    allowSensitive: z.boolean().optional(),
    forwardAuth: z.boolean().optional(),
    name: z.string().optional(),
    title: z.string().max(80).optional(),
    description: description.optional(),
    rateLimitPerMinute: z.int().positive().optional(),
    timeoutMs: z.int().positive().optional(),
    note: z.string().optional(),
  })
  .refine((d) => d.review !== "approved" || !!d.approvedFingerprint, {
    path: ["approvedFingerprint"],
    message: "Approval requires a fingerprint",
  });
/** Developer-owned decisions keyed by capability id. */
export const decisionsSchema = z.strictObject({
  decisionsVersion: z.literal(1),
  capabilities: z.record(idSchema, decision),
});
/** Validate discovery output and retain Zod issue paths. */
export function parseManifest(value: unknown) {
  return manifestSchema.parse(value);
}
/** Validate developer decisions and retain Zod issue paths. */
export function parseDecisions(value: unknown) {
  return decisionsSchema.parse(value);
}
/** Parsed CapabilityKind contract. */
export type CapabilityKind = z.infer<typeof kindSchema>;
/** Parsed Support contract. */
export type Support = z.infer<typeof supportSchema>;
/** Parsed Access contract. */
export type Access = z.infer<typeof accessSchema>;
/** Parsed Sensitivity contract. */
export type Sensitivity = z.infer<typeof sensitivity>;
/** Parsed Framework contract. */
export type Framework = z.infer<typeof framework>;
/** Parsed Evidence contract. */
export type Evidence = z.infer<typeof evidence>;
/** Parsed AuthObservation contract. */
export type AuthObservation = z.infer<typeof auth>;
/** Parsed CapabilityBase contract. */
export type CapabilityBase = z.infer<typeof base>;
/** Parsed JsonSchemaLite contract. */
export type JsonSchemaLite = z.infer<typeof jsonSchema>;
/** Parsed RouteCapability contract. */
export type RouteCapability = z.infer<typeof route>;
/** Parsed EndpointCapability contract. */
export type EndpointCapability = z.infer<typeof endpoint>;
/** Parsed FunctionCapability contract. */
export type FunctionCapability = z.infer<typeof fn>;
/** Parsed FormCapability contract. */
export type FormCapability = z.infer<typeof form>;
/** Parsed FilterSetCapability contract. */
export type FilterSetCapability = z.infer<typeof filter>;
/** Parsed Capability contract. */
export type Capability = z.infer<typeof capability>;
/** Parsed Diagnostic contract. */
export type Diagnostic = z.infer<typeof diagnostic>;
/** Parsed Manifest contract. */
export type Manifest = z.infer<typeof manifestSchema>;
/** Parsed CapabilityDecision contract. */
export type CapabilityDecision = z.infer<typeof decision>;
/** Parsed DecisionsFile contract. */
export type DecisionsFile = z.infer<typeof decisionsSchema>;
