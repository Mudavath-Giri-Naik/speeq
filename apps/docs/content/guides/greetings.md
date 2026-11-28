---

title: Greetings, style and presets
description: "Name, personality, business profile, deterministic greetings and context-aware starter prompts."
---

# Agent identity, style, greetings and starters

Everything here is optional. Without it the assistant behaves as in 0.11. `npx speeq setup` writes
these settings for you (see the CLI guide); this page shows what they do.

## Who the agent is

```ts
createSpeeq({
  agent: {
    name: "Seekh",
    description: "Helps students prepare for GATE with practice questions and courses.",
    instructions: "Explain answers step by step. Recommend previous-year questions for practice.",
    style: {
      personality: "educational", // professional | friendly | conversational | educational | concise | formal | custom
      responseLength: "detailed", // short (default) | medium | detailed
      explanationDepth: "standard", // simple | standard | expert
      nameUsage: "rarely", // never | rarely | greeting-only
      followUps: "suggest", // suggest | none
    },
  },
  business: {
    name: "SwaSeekh",
    description: "GATE preparation platform",
    industry: "education",
    offerings: ["GATE CSE course", "Previous-year questions"],
    terminology: ["PYQ", "mock test"],
    support: "support@swaseekh.example or the Help page",
  },
  // ...
});
```

Style settings map to fixed sentences in the prompt. None of them can remove the safety rules,
input validation or write confirmations: those are added by code, after the settings. For
healthcare, finance and similar apps set `business.sensitive: true`: the agent never volunteers
private details and greetings never use account data.

## Greetings

Greetings are picked on the server from your templates: no model call, nothing invented.

```ts
greeting: {
  guest: ["Welcome to {business}! Looking for GATE questions, subjects or courses?"],
  member: ["You have {cart.count} items in your cart.", "Welcome back, {name}!", "Welcome back!"],
  returning: ["Welcome back, {name}! Continue your DBMS practice?"],
  pages: { pricing: ["Questions about plans? I can help."] },
  frequency: "once-per-session",
  delayMs: 600,
},
```

- `{name}`: the exposed `preferredName` or `displayName` (see `identity.expose`).
- `{business}`, `{agent}`: from the config.
- `{source.field}`: a top-level field of a context source that lists it in `greeting`.

A template whose value is missing is skipped, so a guest never sees "Welcome back, undefined" and a
member without a cart source never sees a cart count. List a template without placeholders last.
`returning` means the signed-in user has an earlier conversation in the same tenant.

## Starter prompts

```ts
starters: [
  { label: "Explore GATE subjects", when: { requires: ["navigation"] } },
  { label: "Open my courses", when: { auth: "member", requires: ["enrolled_courses"] } },
  { label: "Compare plans", when: { routes: ["pricing"] } },
],
```

A starter is shown only when its conditions hold and every capability in `requires` exists: a route
id, a tool or UI action name, a context source id, `category:<category>` (any source of that
category), `navigation` or `knowledge`. At most four are shown. The generated chat box shows them
under the greeting; your own UI reads `useSpeeq().greeting`.

## Errors people see

Provider failures carry a stable `reason` (`rate_limited`, `quota_exhausted`, `invalid_key`,
`model_unavailable`, `busy`, `network`, `timeout`, …). Customers get a calm sentence such as "The
assistant is temporarily busy. Please try again in a moment." In development the server logs one
line for you, without keys or customer data:

```text
[speeq] Model provider groq: status 429, reason rate_limited, retry in 5000 ms. Suggested action: Wait a little, lower traffic, or configure another approved provider.
```
