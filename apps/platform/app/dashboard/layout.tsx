import type { ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { requireAdmin } from "../../lib/auth/session";
import { logout } from "../login/actions";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Shared authenticated platform header. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header>
        <div className="shell head">
          <a href="/dashboard" className="wordmark">
            speeq<span> / platform</span>
          </a>
          <form action={logout}>
            <Button className="subtle">Log out</Button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
