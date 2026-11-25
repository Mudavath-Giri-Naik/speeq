import { Button } from "../../components/ui/button";
import { authStatus } from "../../lib/auth/session";
import { login } from "./actions";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Renders password authentication and generic feedback. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="wordmark">
        speeq<span> / platform</span>
      </div>
      <h1>Admin login</h1>
      {authStatus().enabled ? (
        <form action={login}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
          {error && (
            <p role="alert">
              {error === "throttled" ? "Too many attempts, try again later" : "Incorrect password"}
            </p>
          )}
          <Button>Sign in</Button>
        </form>
      ) : (
        <p>Admin login is not configured</p>
      )}
    </main>
  );
}
