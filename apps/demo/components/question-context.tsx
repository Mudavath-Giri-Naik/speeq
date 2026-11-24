"use client";

import { useSpeeqContext } from "@speeq/react";
import { useEffect, useSyncExternalStore } from "react";

// The page and widget are layout siblings. Relay the mounted question into the widget's provider.
const questions = new Set<{ questionId: number }>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getQuestion() {
  let current: { questionId: number } | undefined;
  for (const question of questions) current = question;
  return current;
}

/** Publishes the current question only while its page is mounted. */
export function QuestionContext({ questionId }: { questionId: number }): null {
  useEffect(() => {
    const question = { questionId };
    questions.add(question);
    for (const listener of listeners) listener();
    return () => {
      questions.delete(question);
      for (const listener of listeners) listener();
    };
  }, [questionId]);
  return null;
}

/** Registers the page data with the assistant's provider. */
export function AssistantQuestionContext(): null {
  const question = useSyncExternalStore(subscribe, getQuestion, () => undefined);
  useSpeeqContext(question ?? {});
  return null;
}
