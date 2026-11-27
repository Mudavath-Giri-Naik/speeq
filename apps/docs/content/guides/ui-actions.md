---

title: Let it act on the page (UI actions)
description: Let the assistant ask your page to open a panel or change a setting, with approval for anything that changes state.
---

# Let it act on the page (UI actions)

**What you will learn:** how the assistant can ask your page to do something, and how you keep that safe.

A **tool** runs on your server. A **UI action** runs in the visitor's browser: open the cart, change the text size, scroll to a section. The assistant can ask for one, but only for actions **you** wrote, and the visitor can say no.

It cannot click, read or script the page. A UI action is a named function you write, nothing more.

## How it works

1. You **declare** the action on the server with `defineUiAction`. That declaration is all the model sees.
2. You **mount a handler** in the browser with `useSpeeqAction`.
3. The model asks. The server checks the arguments, sends a `ui.action` event and ends the turn.
4. The browser runs your handler. For a write it first waits for the visitor's approval.
5. The browser reports what happened. The assistant continues and knows if it worked.

## Declare it (server)

```ts title="lib/ui-actions.ts"
import { defineUiAction } from "speeq/server";
import { z } from "zod";

export const uiActions = [
  defineUiAction({
    name: "ui_set_text_size",
    description: "Make the text on this page larger or normal.",
    input: z.object({ size: z.enum(["normal", "large"]) }),
    risk: "read",
    summary: ({ size }) => `Use ${size} text`,
  }),
  defineUiAction({
    name: "ui_reset_preferences",
    description: "Reset this page's display preferences.",
    input: z.object({}),
    risk: "write", // the visitor must approve
    summary: () => "Reset your display preferences",
  }),
];
```

Pass them to `createSpeeq({ uiActions })`. Names start with `ui_`, must be unique, and cannot match a tool or route name.

## Mount the handler (browser)

```tsx title="components/ui-actions.tsx"
"use client";

import { useSpeeqAction } from "speeq/react";

export function UiActions() {
  useSpeeqAction("ui_set_text_size", (args) => {
    // args were validated by the server, but treat them as untrusted input.
    const size = (args as { size?: string }).size === "large" ? "large" : "normal";
    document.documentElement.dataset.textSize = size;
    return { textSize: size }; // optional JSON, at most 2 KB
  });
  return null;
}
```

Render `<UiActions />` inside `SpeeqProvider`. Without React, use `client.registerUiAction(name, handler)`.

## Ask the visitor

When an action needs approval, `useSpeeq()` gives you `pendingUiAction` (`callId`, `name`, `summary`, `args`). Show the summary and call:

```ts
await resolveUiAction(pendingUiAction.callId, true); // or false to decline
```

The handler never runs before approval. A declined action tells the assistant "declined" and it stops trying more page actions in that turn. You can reuse the same dialog you built for [confirmations](/docs/concepts/confirmations).

## Rules and limits

- **Register handlers when the page mounts.** The session tells the server whether any handler exists. A handler added later is used from the next session.
- A handler that throws reports `failed`. The error message is never sent.
- No handler mounted? The client reports `unavailable`.
- Results over 2 KB are replaced by `{"truncated":true}`, and the model treats results as untrusted data.
- Defaults: 5 UI actions per turn, 30 per session. Change them with `guardrails.uiActionsPerTurn` and `guardrails.uiActionsPerSession`.
- Each result can be used once. A second answer gets `CONFLICT`. An unknown or foreign id gets `NOT_FOUND`.
- Both steps are written to the [audit log](/docs/concepts/audit) as `ui.action.requested` and `ui.action.resolved`, with secrets in the arguments hidden. No telemetry is sent about them.
- Older browser code that does not know about UI actions is never sent them.

> **Warning** Approval is enforced by the browser code you ship. It protects the visitor from the model, not from someone editing their own browser. If an action needs real authority (changing data, money, permissions), do **not** use a UI action. Use a [write tool](/docs/guides/tools), which runs on your server with the server-side confirmation.

## Test it without a model

The mock model in `speeq/testing` can call a UI action in a test, and `startSession(handler, { capabilities: ["ui-actions"] })` plus `session.uiResult(callId, "done")` let you walk through the whole flow. See [Test without a model](/docs/guides/testing).

## See also

[Asking before changes](/docs/concepts/confirmations) · [HTTP protocol](/docs/reference/protocol) · [React hooks](/docs/reference/react) · [Server settings](/docs/reference/server-config)
