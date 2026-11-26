import type { TurnRequest } from "@speeq/core";
/** Untrusted recognition metadata can only restrict a voice turn. */
export function needsClarification(
  turn: Pick<TurnRequest, "inputMode" | "transcript">,
  threshold = 0.5,
) {
  const t = turn.transcript;
  return (
    turn.inputMode === "voice" &&
    !!t &&
    (!!t.ambiguous?.length || (typeof t.confidence === "number" && t.confidence < threshold))
  );
}
