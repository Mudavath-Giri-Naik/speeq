---

title: FAQ
description: Short, plain answers to the questions people ask most.
---

# FAQ

## Does speeq send my visitors' messages to you?

No. Conversations go to **your** server, **your** database, and **your** model provider. The speeq project runs no cloud that receives them.

## Does speeq collect any data at all?

Only if you ask it to. The server can count anonymous numbers, like how many turns happened. It sends them only to a dashboard **you** run, and only if you set an address. You can also turn counting off completely. See [Privacy and telemetry](/docs/concepts/privacy).

## Does it work without voice?

Yes. Voice is optional. Text works everywhere, and it is the fallback when a browser cannot listen or speak.

## Which browsers support voice?

Voice uses the Web Speech features of the browser. Support depends on the browser, the device, and the language. Check `support.speechInput` and `support.speechOutput` before you show voice controls. See [Voice and languages](/docs/guides/voice).

## Can I use my own model?

Yes. Use the OpenAI-compatible adapter for Groq and similar services, the Gemini adapter, or write your own provider. See [Connect a model](/docs/guides/models).

## Is it free?

speeq is open source under the MIT license. You pay your own model provider and hosting.

## Can the assistant change my data by mistake?

Not without a Yes. Tools that change data are marked as writes, and the visitor must approve each one. Your tool also checks permissions again. See [Asking before changes](/docs/concepts/confirmations).

## Does it only work with Next.js?

The handler is a standard web handler that takes a `Request` and returns a `Response`, and the client works without React. Next.js has a ready adapter and a full guide today. Other setups need a little glue code, and they are not documented here yet.

## Is it ready for production?

It is **pre-1.0** (version 0.6.x). It has tests and a security design, but APIs can still change. Pin your versions and read the [Releases](/docs/releases) before upgrading.

## Why does my conversation vanish when I restart?

You are using the memory store. It is for development only. Use a lasting store, like MongoDB, in production. See [Choose a store](/docs/guides/stores).

## How do I report a security problem?

Please do not open a public issue. Read the [Security policy](/docs/security-policy).
