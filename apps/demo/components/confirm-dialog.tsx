import type { PendingConfirmation, UseSpeeqResult } from "@speeq/react";
import { type KeyboardEvent, useId, useLayoutEffect, useRef } from "react";

/** Requires an explicit decision before the assistant runs a write tool. */
export function ConfirmDialog({
  pending,
  confirm,
}: {
  pending: PendingConfirmation;
  confirm: UseSpeeqResult["confirm"];
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const decline = useRef<HTMLButtonElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  const decided = useRef(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    element.showModal();
    decline.current?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  function choose(approved: boolean) {
    if (decided.current) return;
    decided.current = true;
    void confirm(pending.confirmationId, approved);
  }

  function handleKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      choose(false);
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.target === decline.current ? approve.current : decline.current;
      target?.focus();
    }
  }

  return (
    <dialog
      className="assistant-confirm"
      data-testid="confirm-dialog"
      ref={dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKey}
      onCancel={(event) => {
        event.preventDefault();
        choose(false);
      }}
    >
      <h2 id={titleId}>Confirm action</h2>
      <p>{pending.summary}</p>
      <div className="assistant-confirm-actions">
        <button
          className="secondary"
          type="button"
          ref={decline}
          data-testid="confirm-decline"
          onClick={() => choose(false)}
        >
          Decline
        </button>
        <button
          type="button"
          ref={approve}
          data-testid="confirm-approve"
          onClick={() => choose(true)}
        >
          Approve
        </button>
      </div>
    </dialog>
  );
}
