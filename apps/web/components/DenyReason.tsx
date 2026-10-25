"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const REASONS = [
  "Not a real problem",
  "Wrong person to ask",
  "I'll fix it myself",
  "Something else",
] as const;
const MAX_NOTE = 200;

// Deny needs one tap of reason: it becomes a lesson, so a bare "no" teaches nothing.
// The free-text note is optional, except for "Something else".
export function DenyReason({
  what,
  onDeny,
  onCancel,
}: {
  /** "text", "correction" */
  what: string;
  onDeny: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const needsNote = reason === "Something else";
  const ready =
    reason !== null &&
    (!needsNote || note.trim().length > 0) &&
    note.length <= MAX_NOTE;

  return (
    <fieldset className="flex animate-in flex-col gap-3 rounded-control border bg-muted/50 p-4 duration-(--dur-sheet) ease-out-soft fade-in slide-in-from-top-1">
      <legend className="float-left text-sm font-medium">
        Why deny this {what}?
      </legend>
      <div className="clear-left flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <label key={r} className="cursor-pointer">
            <input
              type="radio"
              name="deny-reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="peer sr-only"
            />
            <span className="inline-flex h-9 items-center rounded-full border border-input bg-card px-3.5 text-sm font-medium transition-colors duration-(--dur-hover) peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-muted">
              {r}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor={noteId} className="text-muted-foreground">
          {needsNote ? "Tell us what's wrong" : "Anything to add? (optional)"}
        </label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          aria-invalid={note.length > MAX_NOTE}
          className="bg-card"
        />
        <span className="self-end text-xs text-muted-foreground tabular-nums">
          {note.length}/{MAX_NOTE}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Nothing is sent or changed, and the item stays open. Your reason helps
        RollPay ask better next time.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          disabled={!ready}
          onClick={() =>
            reason && onDeny(note.trim() ? `${reason}: ${note.trim()}` : reason)
          }
        >
          Deny {what}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
