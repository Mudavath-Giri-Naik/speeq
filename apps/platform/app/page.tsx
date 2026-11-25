import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Sends visitors to the authenticated overview. */
export default function Home() {
  redirect("/dashboard");
}
