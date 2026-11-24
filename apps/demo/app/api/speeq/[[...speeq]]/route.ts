import { createNextHandler } from "@speeq/server/next";
import { after } from "next/server";
import { getDemoSpeeq } from "@/lib/speeq";

export const runtime = "nodejs";

async function handle(request: Request) {
  try {
    const speeq = getDemoSpeeq((promise) => after(promise));
    return await createNextHandler(speeq).GET(request);
  } catch {
    return Response.json(
      {
        error: { code: "NOT_CONFIGURED", message: "Server is not configured", retryable: false },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export { handle as GET, handle as OPTIONS, handle as POST };
