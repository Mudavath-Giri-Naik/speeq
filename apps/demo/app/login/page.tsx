import { DEMO_USERS, demoAuthSecret } from "../../lib/demo-auth";
import { signInAdmin, signInStudent } from "./actions";

/** Shows the available demo sign-in choices. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = !!demoAuthSecret();
  const adminEnabled =
    process.env.NODE_ENV?.trim() !== "production" || !!process.env.DEMO_ADMIN_PASSWORD?.trim();
  return (
    <>
      <h1>Sign in</h1>
      {!configured ? (
        <p role="alert">Server is not configured</p>
      ) : (
        <>
          {error === "password" && <p role="alert">Incorrect admin password.</p>}
          {error === "student" && <p role="alert">Choose a student account.</p>}
          <div className="grid">
            <section className="card">
              <h2>Student</h2>
              <form action={signInStudent} className="stack">
                {DEMO_USERS.filter((user) => user.role === "student").map((user) => (
                  <button key={user.id} name="student" value={user.id} type="submit">
                    Continue as {user.name}
                  </button>
                ))}
              </form>
            </section>
            {adminEnabled && (
              <section className="card">
                <h2>Admin</h2>
                <form action={signInAdmin} className="stack">
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <button type="submit">Sign in as admin</button>
                </form>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
