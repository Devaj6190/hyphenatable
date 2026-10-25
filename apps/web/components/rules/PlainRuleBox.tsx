"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The owner types a rule in their own words. It becomes an owner-stated proposal to confirm. */
export function PlainRuleBox({
  initial = "",
  label = "Your rule",
  submitLabel = "Add rule",
  onSubmit,
  onCancel,
}: {
  initial?: string;
  label?: string;
  submitLabel?: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  const clean = text.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clean) return;
        onSubmit(clean);
        setText("");
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Snow plowing after 10 PM pays $5 an hour more than the usual rate."
        className="min-h-20 bg-card"
        maxLength={400}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!clean}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
