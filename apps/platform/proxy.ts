import { NextResponse } from "next/server";
import { methodDenied } from "./lib/ingest/handler";
/** Enforces the method policy before the framework's automatic OPTIONS response. */
export function proxy(request: Request) {
  return request.method === "POST" ? NextResponse.next() : methodDenied();
}
export const config = { matcher: "/api/v1/ingest" };
