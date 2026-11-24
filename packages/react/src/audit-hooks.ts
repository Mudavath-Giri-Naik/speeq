import {
  type AuditClient,
  type AuditClientOptions,
  type AuditListParams,
  type ConversationEvent,
  createAuditClient,
  isSpeeqError,
  type SessionSummary,
  SpeeqError,
} from "@speeq/client";
import { useEffect, useMemo, useRef, useState } from "react";

/** Creates an audit client for the endpoint and credential mode. */
export function useSpeeqAudit(options: AuditClientOptions): AuditClient {
  const latest = useRef(options);
  latest.current = options;
  const { endpoint, credentials } = options;
  return useMemo(
    () => createAuditClient({ ...latest.current, endpoint, credentials }),
    [endpoint, credentials],
  );
}

/** Audit connection and optional session list filter. */
export interface UseAuditSessionsOptions extends AuditClientOptions {
  filter?: Omit<AuditListParams, "cursor">;
}

/** Current session list with pagination and refresh controls. */
export interface UseAuditSessionsResult {
  sessions: SessionSummary[];
  loading: boolean;
  error: SpeeqError | null;
  hasMore: boolean;
  loadMore(): void;
  refresh(): void;
}

interface RequestState<T> {
  data: T;
  loading: boolean;
  error: SpeeqError | null;
}

function requestError(error: unknown) {
  return isSpeeqError(error) ? error : new SpeeqError("INTERNAL");
}

const emptyPage = { sessions: [] as SessionSummary[], nextCursor: null as string | null };

/** Loads session summaries and appends additional pages on demand. */
export function useAuditSessions(options: UseAuditSessionsOptions): UseAuditSessionsResult {
  const client = useSpeeqAudit(options);
  const { userId, from, to, limit } = options.filter ?? {};
  const [version, setVersion] = useState(0);
  const key = JSON.stringify({ userId, from, to, limit, version });
  const [state, setState] = useState<RequestState<typeof emptyPage>>({
    data: emptyPage,
    loading: true,
    error: null,
  });
  const load = useRef<(cursor?: string) => void>(() => {});
  useEffect(() => {
    const filter = JSON.parse(key) as AuditListParams;
    let pending: AbortController | undefined;
    let active = true;
    load.current = (cursor) => {
      if (!active || pending) return;
      const controller = new AbortController();
      pending = controller;
      setState((current) => ({
        data: cursor ? current.data : emptyPage,
        loading: true,
        error: null,
      }));
      void client
        .listSessions({ ...filter, cursor }, controller.signal)
        .then(
          (page) => {
            if (active)
              setState((current) => ({
                data: cursor
                  ? { ...page, sessions: [...current.data.sessions, ...page.sessions] }
                  : page,
                loading: false,
                error: null,
              }));
          },
          (error) => {
            if (active)
              setState((current) => ({ ...current, loading: false, error: requestError(error) }));
          },
        )
        .finally(() => {
          pending = undefined;
        });
    };
    load.current();
    return () => {
      active = false;
      pending?.abort();
    };
  }, [client, key]);
  return {
    sessions: state.data.sessions,
    loading: state.loading,
    error: state.error,
    hasMore: !!state.data.nextCursor,
    loadMore() {
      if (!state.loading && state.data.nextCursor) load.current(state.data.nextCursor);
    },
    refresh() {
      setVersion((current) => current + 1);
    },
  };
}

/** Current session, its ordered events and a reload control. */
export interface UseAuditSessionResult {
  session: SessionSummary | null;
  events: ConversationEvent[];
  loading: boolean;
  error: SpeeqError | null;
  refresh(): void;
}

const emptyDetail = { session: null, events: [] as ConversationEvent[] };

/** Loads and refreshes the event history for a selected session. */
export function useAuditSession(
  sessionId: string | null,
  options: AuditClientOptions,
): UseAuditSessionResult {
  const client = useSpeeqAudit(options);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<
    RequestState<Pick<UseAuditSessionResult, "session" | "events">>
  >({
    data: emptyDetail,
    loading: sessionId !== null,
    error: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh reloads the same selected session.
  useEffect(() => {
    if (sessionId === null) {
      setState({ data: emptyDetail, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: emptyDetail, loading: true, error: null });
    void client.getSession(sessionId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({ data: emptyDetail, loading: false, error: requestError(error) });
      },
    );
    return () => controller.abort();
  }, [client, sessionId, version]);
  return {
    ...(sessionId === null ? emptyDetail : state.data),
    loading: sessionId !== null && state.loading,
    error: sessionId === null ? null : state.error,
    refresh() {
      setVersion((current) => current + 1);
    },
  };
}
