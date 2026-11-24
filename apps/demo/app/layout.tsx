import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Assistant } from "@/components/assistant";
import { canViewAudit } from "@/lib/audit-access";
import { getCurrentUser } from "@/lib/demo-auth";
import { llmMode } from "@/lib/speeq";
import { signOut } from "./login/actions";
import "./globals.css";

/** Titles and description shared by the study pages. */
export const metadata: Metadata = {
  title: { default: "Vidya Study", template: "%s | Vidya Study" },
  description: "Browse original practice questions across six subjects.",
};

/** Provides site navigation and account controls. */
export default async function Layout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="shell header-row">
            <Link className="brand" href="/">
              Vidya Study
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/subjects">Subjects</Link>
              <Link href="/practice">Practice</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/about">About</Link>
              {canViewAudit(user) && <Link href="/admin/conversations">Admin</Link>}
            </nav>
            {user ? (
              <form action={signOut} className="account">
                <span>{user.name}</span>
                <button className="secondary" type="submit">
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login" className="account">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="shell content">{children}</main>
        <Assistant llmMode={llmMode} viewerId={user?.id} />
        <footer className="shell site-footer">
          <Link href="/about">About Vidya Study</Link>
        </footer>
      </body>
    </html>
  );
}
