"use client";

import { useSpeeqAction } from "@speeq/react";
import { z } from "zod";

const sizeArgs = z.object({ size: z.enum(["normal", "large"]) });

/** Applies a display preference. Arguments are validated again: they are untrusted input. */
function setTextSize(size: "normal" | "large") {
  document.documentElement.dataset.textSize = size;
  return { textSize: size };
}

/** Mounts the browser side of the demo's UI actions. Renders nothing. */
export function UiActions(): null {
  useSpeeqAction("ui_set_text_size", (args) => {
    const parsed = sizeArgs.safeParse(args);
    if (!parsed.success) throw new Error("invalid arguments");
    return setTextSize(parsed.data.size);
  });
  useSpeeqAction("ui_reset_preferences", () => setTextSize("normal"));
  return null;
}
