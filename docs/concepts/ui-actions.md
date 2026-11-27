# UI actions

A UI action lets the agent ask the page to do something: open a panel, change a display setting, focus a field. It is a named function you write, never a DOM operation. The agent cannot click, read or script the page.

## How it works

1. **Declare it on the server** with `defineUiAction` and pass it to `createSpeeq({ uiActions })`. The declaration is all the model sees. A page cannot add actions the server did not declare.
2. **Mount a handler in the browser** with `useSpeeqAction(name, handler)` (React) or `client.registerUiAction(name, handler)`.
3. The server validates the model's arguments with your Zod `input`, then streams a `ui.action` event and ends the turn.
4. The client runs the handler. For `risk: "write"` (or `confirm: true`) it first sets `pendingUiAction`; render an approval and call `resolveUiAction(callId, approved)`.
5. The client posts the outcome to `POST /session/:id/ui-result` and the agent continues knowing whether the action happened.

```ts
// server
defineUiAction({
  name: "ui_open_cart",
  description: "Open the shopping cart panel",
  input: z.object({}),
  risk: "read",
  summary: () => "Open the cart",
});
```

```tsx
// browser
useSpeeqAction("ui_open_cart", () => {
  openCart();
  return { opened: true }; // optional JSON, at most 2 KB
});
```

## Rules

- Names start with `ui_`, are unique, and cannot collide with a tool or route.
- Handlers receive validated arguments but must still treat them as untrusted input.
- Returning JSON tells the model what happened. Throwing reports `failed`; the error message is never sent.
- Results over 2 KB are replaced by `{"truncated":true}`. The result is shown to the model as untrusted data.
- A declined action stops further UI actions in that user turn. Defaults: 5 per turn, 30 per session (`guardrails.uiActionsPerTurn`, `guardrails.uiActionsPerSession`).
- A new user message supersedes an unanswered action. A result can be claimed once (`CONFLICT` on replay, `NOT_FOUND` for unknown ids or another session's id).
- The action is offered only to sessions whose client registered a handler **before the session was created**. Register handlers on mount; a handler added later is used from the next session.
- Both events appear in the audit log (`ui.action.requested`, `ui.action.resolved`), with arguments redacted like tool arguments. No telemetry is sent about them.
- Approval for `write` actions is enforced by the client you ship. It protects the user from the model, not from a user who edits their own browser, so never use a UI action for anything that needs server authority: use a write tool, which runs on your server with the server-side confirmation flow.

## Forms

An approved form becomes a UI action that fills a **draft** (`defineFormFill`, generated into `.speeq/generated/ui.ts`). The page binds it with `useSpeeqForm(formId, { setValues, isDirty })`. The assistant never submits; protected, unknown and wrongly typed fields are rejected before they reach the page, and fields the visitor edited are not overwritten. See [ADR-0018](../decisions/0018-form-filling-and-filters.md).

Design record: [ADR-0017](../decisions/0017-ui-bridge-contract.md).
