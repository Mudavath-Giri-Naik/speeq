---

title: Privacy and telemetry
description: Exactly what data goes where, what speeq counts, and how to turn it all off.
---

# Privacy and telemetry

**What you will learn:** where your visitors' data goes, what speeq can count, and how to switch counting off.

## Where data goes

| Data                                          | Goes to                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Conversation history and audit events         | **Your** store and database                                                        |
| The prompt, recent messages, and tool results | **Your** model provider                                                            |
| Speech audio                                  | The **browser vendor**, if you use the default Web Speech (depends on the browser) |
| Anonymous counters                            | Only a dashboard **you** run, and only if you set an address                       |

speeq the project does not receive your visitors' messages. There is no speeq cloud.

## Anonymous counters (telemetry)

The server counts a few numbers in memory. Nothing is sent unless **you** set `SPEEQ_PLATFORM_URL` (or `telemetry.endpoint`) to a dashboard you run.

**What is counted:** a random instance ID, an optional public project key, the runtime and framework, which features are on, and totals like turns, tool calls, page opens, approvals, languages, response times and error codes.

**What is never sent:** conversation text, audio, prompts, tool names, tool arguments or results, knowledge content, route names, URLs, user or session IDs, model names, IP addresses, headers, passwords, keys, or stack traces.

An automated test checks that no forbidden field can ever be added.

## Turn counting off

Any one of these is enough:

- Set `SPEEQ_TELEMETRY=0` in the environment.
- Pass `telemetry: { enabled: false }` to `createSpeeq`.
- Do not set a platform address. With no destination, telemetry stays inactive.

## The development update notice

During development, the first time the server starts, it asks npm once which version is newest and prints a note if yours is old. It is a plain request with no data from your app. npm can see normal connection details, like your IP address. It never runs in production or CI. Turn it off with `SPEEQ_UPDATE_CHECK=0`, `SPEEQ_TELEMETRY=0`, or `updateCheck: false`.

## This website

This documentation site uses no cookies and no third-party trackers. The adoption numbers come from public npm and GitHub data.

## Next steps

- [Telemetry fields, one by one](/docs/reference/telemetry)
- [The usage dashboard](/docs/guides/dashboard)
