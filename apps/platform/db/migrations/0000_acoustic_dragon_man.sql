CREATE TABLE "error_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"project_id" uuid,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"code" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_throttle" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "ingest_throttle_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "instances" (
	"instance_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"sdk_version" text,
	"runtime_name" text,
	"runtime_version" text,
	"framework" text,
	"features" jsonb
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "projects_key_unique" UNIQUE("key"),
	CONSTRAINT "project_name_length" CHECK (char_length("projects"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "usage_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"project_id" uuid,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"sessions" integer NOT NULL,
	"turns" integer NOT NULL,
	"voice_turns" integer NOT NULL,
	"text_turns" integer NOT NULL,
	"tool_builtin" integer NOT NULL,
	"tool_custom" integer NOT NULL,
	"navigations" integer NOT NULL,
	"knowledge_searches" integer NOT NULL,
	"confirmations_requested" integer NOT NULL,
	"confirmations_approved" integer NOT NULL,
	"confirmations_rejected" integer NOT NULL,
	"languages" jsonb NOT NULL,
	"latency_total" jsonb NOT NULL,
	"latency_first_token" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_counts" ADD CONSTRAINT "error_counts_instance_id_instances_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("instance_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_counts" ADD CONSTRAINT "error_counts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instances" ADD CONSTRAINT "instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_instance_id_instances_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("instance_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "errors_code_received_idx" ON "error_counts" USING btree ("code","received_at");--> statement-breakpoint
CREATE INDEX "usage_received_idx" ON "usage_rollups" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "usage_project_received_idx" ON "usage_rollups" USING btree ("project_id","received_at");