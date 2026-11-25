CREATE TABLE "external_stats" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
