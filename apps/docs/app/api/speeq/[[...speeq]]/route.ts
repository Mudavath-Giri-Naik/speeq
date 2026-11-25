import { createNextHandler } from "speeq/server/next";
import { assistant } from "../../../../lib/assistant/speeq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const { GET, POST, OPTIONS } = createNextHandler(assistant);
