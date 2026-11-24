import {
  createSpeeqClient,
  type SpeeqClient,
  type SpeeqClientOptions,
  type SpeeqSnapshot,
} from "@speeq/client";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createContextRegistry } from "./context-registry.js";

/** Configuration for a provider-owned client or an existing client. */
export interface SpeeqProviderProps extends SpeeqClientOptions {
  children: ReactNode;
  /** Use an existing client instead of creating one. The other options are then ignored. */
  client?: SpeeqClient;
}

const ProviderContext = createContext<{
  client: SpeeqClient;
  getServerSnapshot: () => SpeeqSnapshot;
  registry: ReturnType<typeof createContextRegistry>;
} | null>(null);

const serverSnapshots = new WeakMap<SpeeqClient, SpeeqSnapshot>();

function initialServerSnapshot(client: SpeeqClient) {
  let snapshot = serverSnapshots.get(client);
  if (!snapshot) {
    snapshot = {
      ...client.getSnapshot(),
      support: { speechInput: false, speechOutput: false, voiceForLanguage: null },
    };
    serverSnapshots.set(client, snapshot);
  }
  return snapshot;
}

/** Makes a speeq client available to descendant hooks. */
export function SpeeqProvider(props: SpeeqProviderProps): JSX.Element {
  const navigate = useRef(props.onNavigate);
  const context = useRef(props.getContext);
  navigate.current = props.onNavigate;
  context.current = props.getContext;
  const [registry] = useState(() => createContextRegistry(() => context.current?.()));
  const [initial] = useState(() => ({
    client:
      props.client ??
      createSpeeqClient({
        ...props,
        onNavigate: (action) => navigate.current?.(action),
        getContext: registry.getContext,
      }),
    owned: props.client === undefined,
  }));
  const client = props.client ?? initial.client;
  const owned = initial.owned && client === initial.client && props.client === undefined;
  useEffect(() => {
    if (owned) return () => client.cancel();
  }, [owned, client]);
  const value = useMemo(() => {
    const snapshot = initialServerSnapshot(client);
    return { client, getServerSnapshot: () => snapshot, registry };
  }, [client, registry]);
  return <ProviderContext.Provider value={value}>{props.children}</ProviderContext.Provider>;
}

/** Reads the provider store for a named hook. */
export function useProvider(hook: string) {
  const value = useContext(ProviderContext);
  if (!value) throw new Error(`${hook} must be used inside <SpeeqProvider>`);
  return value;
}
