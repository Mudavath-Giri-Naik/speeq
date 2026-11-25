---

title: Introduction
description: What speeq is, who it is for, and what it does not do.
---

# Introduction

speeq lets visitors **talk or type** to your website. The assistant can answer questions, open pages, and do things for the visitor, like looking up an order. You keep control of the design, the data, and the model.

> **Note** speeq is **pre-1.0** (version 0.2.x). It works today, but APIs can still change before 1.0. You install it with the `next` tag.

## What you get

- **A server piece.** It runs inside your own backend. It talks to the AI model, runs your tools, and saves the conversation to your database.
- **A browser piece.** It streams the answer to the page, listens to the microphone, and speaks replies. It has no design of its own. You build the buttons and chat window.
- **React helpers.** A provider and a few hooks, so a chat box takes about 30 lines.
- **Safety built in.** Changes to your data need a Yes from the visitor. Every conversation can be written to an audit log.

## What speeq is not

- It is **not** a hosted chatbot. There is no speeq cloud that sees your visitors' messages.
- It is **not** a UI kit. It gives you data and events. You choose how they look.
- It does **not** include an AI model. You bring your own, like Groq, Gemini, or any service that speaks the OpenAI chat format.

## Who it is for

Teams that already have a website or web app and want a helpful assistant that **uses their own data** safely. If you can write a Next.js route, you can add speeq.

## How the pieces fit

```text
Browser  ──►  Your server (speeq)  ──►  Your model
                    │
                    ├──►  Your tools and data
                    └──►  Your database (conversation history)
```

Read [How it works](/docs/concepts/how-it-works) for the full story.

## Next steps

- Try it in 5 minutes with no API keys: [Quickstart](/docs/quickstart).
- Prefer to let an AI coding tool do the setup: [Set up with an AI assistant](/docs/ai-setup).
- Worried about privacy? Read [Privacy and telemetry](/docs/concepts/privacy).
