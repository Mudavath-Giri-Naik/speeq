---

title: Design decisions
description: The big choices behind speeq, and the reason for each, in short.
---

# Design decisions

These are the choices that shaped speeq. Each one has a longer record in the repository, in `docs/decisions`.

## One workspace for all packages

All packages live in one repository, built with pnpm and Turborepo. This keeps versions in step and makes changes across packages easy to test.

## Headless, with history in your store

speeq has no design of its own, so it fits any app. The conversation history lives in a store you choose. The server stays stateless, and the audit log comes from the same data.

## Shared checks with zod

The shapes of messages and events are written once with zod and shared by the server and the client. The packages can point at source files during development, so tests need no build.

## Anonymous counters, sent after turns

Telemetry is off unless you set an address. It sends only anonymous counts. It sends them after a turn, not from a background timer.

## Standard requests, streaming, and signed tokens

The handler takes a normal web `Request` and returns a `Response`. Answers stream as Server-Sent Events. Sessions use signed tokens, so any server copy can check them without a session database.

## Biome for formatting and linting

One fast tool replaces several. Fewer settings, the same result for everyone.

## TypeScript 6

The project pins one TypeScript version, so everyone sees the same checks.

## A browser client with no dependencies

The browser package carries no third-party code, so it stays small and safe to bundle.

## Postgres and PGlite for the dashboard

The dashboard uses Postgres in production. For local work it uses PGlite, a Postgres that runs inside Node, so you need nothing installed.

## A development-only update note

In development, the server may ask npm once whether a newer version exists. It sends no data from your app. It is off in production and CI, and you can turn it off with one setting.

## Read more

The full records are in the repository: [docs/decisions](https://github.com/Mudavath-Giri-Naik/speeq/tree/main/docs/decisions).
