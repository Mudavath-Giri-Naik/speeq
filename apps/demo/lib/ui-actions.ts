import { defineFormFill, defineUiAction } from "@speeq/server";
import { z } from "zod";
import { PRACTICE_FORM_FIELDS, PRACTICE_FORM_ID } from "./forms";

/** Fills a draft of the practice filters. The visitor presses "Apply filters" themselves. */
export const practiceFormFill = defineFormFill({
  id: PRACTICE_FORM_ID,
  title: "Practice filters",
  fields: PRACTICE_FORM_FIELDS,
});

/**
 * Page actions the assistant may ask for. They only change local display preferences: nothing is
 * stored on the server and no data is deleted. The browser handlers live in
 * `components/ui-actions.tsx`.
 */
export const uiActions = [
  practiceFormFill,
  defineUiAction({
    name: "ui_set_text_size",
    description: "Make the text on this page larger or return it to the normal size.",
    input: z.object({ size: z.enum(["normal", "large"]) }),
    risk: "read",
    summary: ({ size }) => `Use ${size} text`,
  }),
  defineUiAction({
    name: "ui_reset_preferences",
    description: "Reset this page's display preferences, such as text size, to their defaults.",
    input: z.object({}),
    risk: "write",
    summary: () => "Reset your display preferences",
  }),
];
