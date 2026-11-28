---

title: The terminal control center
description: "Manage the agent from npx speeq setup: status, sections, one recommendation, reviewed saves and rollback."
---

# The terminal control center

`npx speeq setup` is where you manage the whole agent after `npx speeq init`. It reads your app
(routes, sign-in, endpoints, layout metadata), shows where things stand, and suggests the one thing
worth doing next. It changes ordinary files in your project that you can read and edit.

```text
speeq · personalised application intelligence
Project      Seekh
Framework    Next.js App Router
Model        groq · llama-3.3-70b-versatile
Sign-in      Supabase Auth detected, not bound
Memory       this conversation only
Verified     not yet

01  Agent identity and personality     ✓ set      educational · education preset
02  Business information               ✓ set      SwaSeekh
05  Authentication and identity        ! review   Supabase Auth detected, not bound
06  Customer context and permissions   ! review   3 candidates to review
...
Recommended  Bind Supabase Auth so the agent knows who is signed in  (about 1 minute)
```

## How a change is made

1. Pick a section. Each line shows its current value; pick one to change it. Every screen has
   **Back** and **? Help**. Ctrl+C at any point writes nothing.
2. Choose **Save and finish**. speeq shows each file it will change as a diff and asks once.
3. It writes through the integration journal and prints a receipt: what changed, what to restart,
   and `npx speeq rollback` to undo the save.

Your choices are kept in `.speeq/setup.json` (no keys, no URIs) and rendered into one server-only
file, `.speeq/generated/agent.ts`. The first save adds one import and `...agentSettings,` to the
`createSpeeq({` call in your `speeq.config.ts`. Anything you write after that spread wins; setup tells
you which of its settings you override instead of pretending it changed them.

## Sign-in (section 05)

speeq lists the sign-in systems it found with the file and line it found them in:

| Found                                                      | What setup can do                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Auth.js v5, NextAuth v4, Supabase Auth, Clerk, Better Auth | Bind it: generates `.speeq/generated/identity.ts` with a `resolveUser` that calls your own session code |
| A package only (no server code found)                      | Says what is missing                                                                                    |
| Kinde, your own `getCurrentUser`                           | Requires review: write `resolveUser` yourself                                                           |
| Firebase Auth                                              | Unsupported: verify the cookie with `firebase-admin`                                                    |

Tick which profile fields the agent may know (display name, preferred name, language). User ids,
tenants and emails are never shared with the model or the browser. Visitors who are not signed in
keep using the assistant as guests.

## Customer data (section 06)

Endpoints such as `/api/cart`, `/api/orders`, `/api/me` or `/api/enrollments` are listed with what
speeq can see in the code: the response fields, whether the handler calls your auth, and whether it
mentions the session user. Approve a source by ticking the fields the agent may see. Fields that look
sensitive (passwords, tokens, card numbers, OTPs) are shown as restricted and can never be ticked. If
speeq sees no sign-in check in the endpoint, it asks you to confirm the endpoint returns only the
signed-in user's own data before it binds it. Approved sources call your endpoint with the visitor's
own cookies, so your endpoint keeps deciding what they may see. Endpoints that need a path or query
parameter need a few lines of `defineContext` (see [Customer context](/docs/guides/customer-context)).

## Storage (section 10)

Choose MongoDB and paste the connection URI. It is hidden as you type, never printed, and saved only
in `.env.local` (`SPEEQ_MONGODB_URI`, `SPEEQ_MONGODB_DB`). If you agree, setup connects with your app's
own `mongodb` driver (offering to install it), pings, writes one document to `speeq_probe` and deletes
it. It reads no other collection and runs no migrations. Status moves from "configured" to
"connection verified"; `npx speeq verify` checks persistence.

## Without a terminal

`npx speeq setup --json` prints the sections, the recommendation, discovered sign-in, data sources and
business facts as JSON. Keys and URIs are never included, only whether they are present.

## Other sections

- **01 Agent** and **02 Business**: [Greetings and style](/docs/guides/greetings).
- **03 Model**: keys are checked at once and models get one tiny test message; your old provider stays
  until you save.
- **08 Greetings**: a preview for guest, member and returning visitors with sample data.
- **09 Memory**: [Memory](/docs/guides/memory).
- **12 Verification**: the same static and mock-model checks as `npx speeq verify`.
