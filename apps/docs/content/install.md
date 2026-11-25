---

title: Install
description: How to install speeq, which package to pick, and what you need first.
---

# Install

**What you will learn:** which packages to install, and what your project needs first.

## What you need

- **Node.js 20 or newer.**
- **zod version 4.** speeq uses it to check data. It is a "peer" package, so you install it yourself.
- **React 18 or newer**, only if you use the React hooks.
- **MongoDB driver 6 or newer**, only if you use the MongoDB store.

## The easy way: one package

```bash pm
npm i speeq@next zod
```

`speeq` is one package that gives you everything. You import from small paths, so you only bundle what you use:

| Import                        | What it is                              |
| ----------------------------- | --------------------------------------- |
| `speeq/server`                | The server handler, tools, and routes   |
| `speeq/server/next`           | The Next.js adapter                     |
| `speeq/client`                | The browser client (no React needed)    |
| `speeq/react`                 | The React provider and hooks            |
| `speeq/testing`               | The mock model and test helpers         |
| `speeq/llm-openai-compatible` | Groq and other OpenAI-style services    |
| `speeq/llm-gemini`            | Google Gemini                           |
| `speeq/store-memory`          | A store for local development           |
| `speeq/store-mongodb`         | A MongoDB store (install `mongodb` too) |
| `speeq/core`                  | Shared types and checks                 |

> **Note** `speeq/store-mongodb` needs the `mongodb` package. If you forget it, Node tells you the module is missing. React and MongoDB are **optional**, so a plain install does not add them.

## The precise way: scoped packages

Each part also lives in its own package. Install only what you need:

```bash pm
npm i @speeq/server@next @speeq/react@next @speeq/store-memory@next zod
```

Everything in the table above works the same with `@speeq/` instead of `speeq/`. For example, `speeq/server` is the same as `@speeq/server`.

## Which channel?

speeq is pre-1.0. Today `npm i speeq` and `npm i speeq@next` give you the same version. Use `@next` anyway, so you keep getting the newest pre-1.0 releases.

## Next steps

- [Quickstart](/docs/quickstart)
- [See all packages and their live version](/docs/packages)
