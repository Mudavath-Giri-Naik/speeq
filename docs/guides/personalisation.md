# Personalisation: sign-in, customer data, greetings and memory

Release 0.12 lets the assistant know who is signed in, what they own, what they are looking at and
what they asked before, using only what your app already has and only what you approve. Nothing here
is required: an app without these settings behaves exactly as in 0.11.

## The fast way

```bash
npx speeq@next init     # once
npx speeq@next setup    # the control center
```

`setup` finds your sign-in system and the endpoints that describe customers, suggests a preset from
your routes, prefills the business description from your layout metadata, and saves ordinary files
you can read. See [the control center](control-center.md).

## Sign-in

The generated `.speeq/generated/identity.ts` calls your own server-side session. It runs on the
server for every speeq request; the browser can never say who it is.

**Auth.js (NextAuth v5).** Found from `export const { auth } = NextAuth(...)`:

```ts
import { auth } from "../../auth";
export async function resolveUser(_request: Request) {
  const session = await auth();
  const id = session?.user?.id ?? session?.user?.email;
  return id ? { id, profile: { displayName: session.user.name ?? undefined } } : null;
}
```

**NextAuth v4.** Found from an exported `authOptions` outside a route file; calls
`getServerSession(authOptions)`.

**Supabase Auth.** Found from your `createClient()` that calls `createServerClient` from `@supabase/ssr`:

```ts
const supabase = await createClient();
const { data, error } = await supabase.auth.getUser(); // validated by Supabase, not just the cookie
if (error) {
  if (error.name === "AuthRetryableFetchError") throw error; // speeq answers AUTH_UNAVAILABLE
  return null;
}
return data.user ? { id: data.user.id } : null;
```

**Clerk** (with `clerkMiddleware()`): `auth()` gives `userId`, and `orgId` becomes the tenant, so an
organisation switch starts a fresh conversation. **Better Auth**: `auth.api.getSession({ headers })`.

**Anything else** (Kinde, Firebase, your own helper): write `resolveUser` in `speeq.config.ts` and
return `{ id, tenantId?, profile? }` from your session, or `null` for guests. Firebase Auth needs
`firebase-admin` to verify the session cookie.

When the sign-in changes, speeq reacts on the next request: a logout, a different account or another
organisation ends the old conversation (`IDENTITY_CHANGED`) and the browser starts a fresh one.
Pending confirmations, page actions and speech of the old account are dropped.

## Customer data

Approved sources come from your own endpoints or services; speeq keeps no copy of customer data.

```ts
defineContext({
  id: "enrollments",
  description: "Courses the signed-in student is enrolled in",
  category: "ownership",
  output: z.object({ courses: z.array(z.object({ title: z.string(), slug: z.string() })) }),
  expose: ["courses[].title", "courses[].slug"], // only these reach the model
  fetch: (ctx) => listEnrollments(ctx.user!.id), // your service, your permission checks
});
```

Sources are fetched on demand by default (`get_context`), with timeouts and size limits, once per
request at most. Fields named like passwords, tokens, cards or OTPs are always dropped, and so are
values that look like secrets. Ownership and access always come from these sources, never from
memory or the conversation. More in [Customer context](customer-context.md).

## Greetings and starters

Chosen on the server without a model call. A template whose value is missing is skipped:

```ts
greeting: {
  guest: ["Welcome to {business}! Looking for GATE questions?"],
  member: ["Welcome back, {name}! You have {enrollments.count} courses.", "Welcome back, {name}!"],
},
starters: [{ label: "Open my enrolled courses", when: { auth: "member", requires: ["enrollments"] } }],
```

See [Greetings and style](agent-greetings-and-style.md).

## Memory

`memory.mode: "persistent"` continues a signed-in user's last conversation; `"preferences"` also keeps
what they say about how they want help. See [Memory](memory.md).

## Turn it off

- Remove the `...agentSettings,` line (and `agent: agentProfile`) from `speeq.config.ts`, or run
  `npx speeq rollback` right after a save.
- Or keep the settings and switch parts off in `npx speeq setup`: unbind sign-in, turn sources off,
  set memory to "This conversation only", turn greetings off.
- Users can clear their own memory from the chat box (Forget) when memory is on.

## Upgrading from 0.11

Nothing changes until you save settings in `npx speeq setup`. Stored conversations keep working:
sessions written before 0.12 have no tenant and read as `tenantId: null`. Version 1 session tokens
still verify. After upgrading the package, run `npx speeq setup` once if you want the new chat box
features (server greeting, New conversation, Forget); the generated chat box is refreshed when you
save.

## Privacy and security in one list

- The server decides who the user is, on every request. Browser-sent ids, roles or emails are ignored.
- User ids, tenant ids and emails never reach the model or the browser.
- The model sees only approved fields, as data marked untrusted, below your instructions and above
  speeq's safety rules. A product description or display name cannot change what the agent may do.
- Permissions are decided by your tools and sources, never by the model.
- Memory is scoped to user and tenant; anonymous visitors never get memory.
- Maintainer telemetry carries counts only: no names, ids, carts, courses, conversations, preferences
  or business details (tested).
- Provider errors reach customers as a calm sentence with a stable reason; keys, prompts and provider
  bodies never do.

## Troubleshooting

| Symptom                                    | Check                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| The agent never knows who is signed in     | `npx speeq doctor`: P2 sign-in binding. Is `resolveUser` set, and does it return a user on the server? |
| "Your account changed" right after sign-in | Expected: the old guest conversation ended. The new one is the user's own.                             |
| Customer data is "unavailable"             | The endpoint returned an error or a different shape; see the server log line.                          |
| Conversations do not continue              | Memory mode, sign-in bound, and a persistent store (`npx speeq verify --live-store` for MongoDB).      |
| "The assistant is busy right now"          | Rate limited. In development the server logs `reason=rate_limited` and what to do.                     |
| Settings in the terminal have no effect    | `npx speeq doctor`: P1. Your `speeq.config.ts` may set the same property after the spread.             |
