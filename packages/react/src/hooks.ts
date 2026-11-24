import type { SpeeqClient, SpeeqClientEvents, SpeeqSnapshot } from "@speeq/client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useProvider } from "./provider.js";

/** Live client snapshot and stable client actions. */
export interface UseSpeeqResult extends SpeeqSnapshot {
  client: SpeeqClient;
  sendText: SpeeqClient["sendText"];
  startListening: SpeeqClient["startListening"];
  stopListening: SpeeqClient["stopListening"];
  cancel: SpeeqClient["cancel"];
  setLanguage: SpeeqClient["setLanguage"];
  confirm: SpeeqClient["confirm"];
  speak: SpeeqClient["speak"];
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
        cancel: client.cancel.bind(client),
        setLanguage: client.setLanguage.bind(client),
        confirm: client.confirm.bind(client),
        speak: client.speak.bind(client),
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
