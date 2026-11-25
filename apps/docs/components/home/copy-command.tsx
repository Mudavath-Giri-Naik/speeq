"use client";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "../icons";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          // clipboard blocked: the command stays visible so it can be selected
        }
      }}
      className="btn btn-ghost group font-mono !text-[0.85rem]"
      aria-label={copied ? "Copied install command" : `Copy install command: ${command}`}
    >
      <span className="text-accent" aria-hidden="true">
        $
      </span>
      <span>{command}</span>
      <span className="text-muted transition group-hover:text-fg" aria-hidden="true">
        {copied ? (
          <CheckIcon width={16} height={16} className="text-ok" />
        ) : (
          <CopyIcon width={16} height={16} />
        )}
      </span>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
