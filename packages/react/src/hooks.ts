import {
  createFormFillHandler,
  type FormBinding,
  formFillActionName,
  type IdentitySummary,
  type SpeeqClient,
  type SpeeqClientEvents,
  type SpeeqSnapshot,
  type UiActionHandler,
} from "@speeq/client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useProvider } from "./provider.js";

/** Live client snapshot and stable client actions. */
export interface UseSpeeqResult extends SpeeqSnapshot {
  client: SpeeqClient;
  sendText: SpeeqClient["sendText"];
  startListening: SpeeqClient["startListening"];
  stopListening: SpeeqClient["stopListening"];
  startCall: SpeeqClient["startCall"];
  endCall: SpeeqClient["endCall"];
  cancel: SpeeqClient["cancel"];
  setLanguage: SpeeqClient["setLanguage"];
  confirm: SpeeqClient["confirm"];
  /** Approves or declines `pendingUiAction`. */
  resolveUiAction: SpeeqClient["resolveUiAction"];
  speak: SpeeqClient["speak"];
  refreshIdentity: SpeeqClient["refreshIdentity"];
  newConversation: SpeeqClient["newConversation"];
}

/** Reads the current snapshot and actions of the provider's client. */
export function useSpeeq(): UseSpeeqResult {
  const { client, getServerSnapshot } = useProvider("useSpeeq");
  const store = useMemo(
    () => ({
      subscribe: client.subscribe.bind(client),
      getSnapshot: client.getSnapshot.bind(client),
      actions: {
        client,
        sendText: client.sendText.bind(client),
        startListening: client.startListening.bind(client),
        stopListening: client.stopListening.bind(client),
        startCall: client.startCall.bind(client),
        endCall: client.endCall.bind(client),
        cancel: client.cancel.bind(client),
        setLanguage: client.setLanguage.bind(client),
        confirm: client.confirm.bind(client),
        resolveUiAction: client.resolveUiAction.bind(client),
        speak: client.speak.bind(client),
        refreshIdentity: client.refreshIdentity.bind(client),
        newConversation: client.newConversation.bind(client),
      },
    }),
    [client],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return { ...snapshot, ...store.actions };
}

/** Registers data from the current page for subsequent conversation requests. */
export function useSpeeqContext(data: Record<string, unknown>): void {
  const { registry } = useProvider("useSpeeqContext");
  const current = useRef(data);
  current.current = data;
  useEffect(() => registry.register(() => current.current), [registry]);
}

/**
 * Mounts the page code for a UI action declared on the server with `defineUiAction`. The latest
 * `handler` is always used and the registration ends on unmount. `args` are validated by the server
 * but are still untrusted input. Nothing runs during server rendering.
 */
export function useSpeeqAction(name: string, handler: UiActionHandler): void {
  const { client } = useProvider("useSpeeqAction");
  const current = useRef(handler);
  current.current = handler;
  useEffect(
    () => client.registerUiAction(name, (args, signal) => current.current(args, signal)),
    [client, name],
  );
}

/**
 * Lets the assistant fill a **draft** of one of your forms. `formId` is the form's capability id from
 * `.speeq/manifest.json` (for example `form:app/contact/page.tsx#form1`). The assistant never submits:
 * the visitor presses your button. Fields the visitor already edited are not overwritten, and the
 * latest `binding` is always used.
 */
export function useSpeeqForm(formId: string, binding: FormBinding): void {
  const current = useRef(binding);
  current.current = binding;
  const handler = useMemo(
    () =>
      createFormFillHandler({
        setValues: (values) => current.current.setValues(values),
        isDirty: (name) => current.current.isDirty(name),
      }),
    [],
  );
  useSpeeqAction(formFillActionName(formId), handler);
}

/** Subscribes to a client event and calls the latest handler. */
export function useSpeeqEvent<K extends keyof SpeeqClientEvents>(
  event: K,
  handler: (payload: SpeeqClientEvents[K]) => void,
): void {
  const { client } = useProvider("useSpeeqEvent");
  const current = useRef(handler);
  current.current = handler;
  useEffect(() => client.on(event, (payload) => current.current(payload)), [client, event]);
}

/** Result of {@link useSpeeqIdentity}. */
export interface UseSpeeqIdentityResult {
  /** Who the server says is talking, or `null` before the first session or check. */
  identity: IdentitySummary | null;
  /** Checks again now (for example right after your app's own login or logout). */
  refresh: SpeeqClient["refreshIdentity"];
}

/**
 * The signed-in identity as the speeq server sees it. Updates when the user logs in, logs out or
 * switches account; after such a change the conversation has already been reset.
 */
export function useSpeeqIdentity(): UseSpeeqIdentityResult {
  const { client, getServerSnapshot } = useProvider("useSpeeqIdentity");
  const store = useMemo(
    () => ({
      subscribe: client.subscribe.bind(client),
      get: () => client.getSnapshot().identity,
      refresh: client.refreshIdentity.bind(client),
    }),
    [client],
  );
  const identity = useSyncExternalStore(
    store.subscribe,
    store.get,
    () => getServerSnapshot().identity,
  );
  const refresh = store.refresh;
  return { identity, refresh };
}
