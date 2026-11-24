import Link from "next/link";
import { AuditBrowser } from "@/components/audit-browser";
import { canViewAudit } from "@/lib/audit-access";
import { getCurrentUser } from "@/lib/demo-auth";

/** Checks the account on the server before mounting the conversation browser. */
export default async function ConversationsPage() {
  const user = await getCurrentUser();
  return (
    <>
      <h1>Conversations</h1>
      {canViewAudit(user) ? (
        <AuditBrowser />
      ) : (
        <section className="card" data-testid="audit-denied">
          <h2>Access denied</h2>
          <p>Only a demo administrator can view conversation history.</p>
          <Link href="/login">Sign in as admin</Link>
        </section>
      )}
    </>
  );
}
