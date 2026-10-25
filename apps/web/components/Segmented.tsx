"use client";

import type { LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<V extends string> = {
  value: V;
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; `label` stays as the accessible name. */
  iconOnly?: boolean;
};

// A radio group drawn as a pill track. Equal-width segments, so the selection surface moves with
// CSS alone. Native radios give arrow-key navigation and form semantics for free.
export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  label,
  size = "default",
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: SegmentedOption<V>[];
  /** Accessible group name, e.g. "View as" or "Theme". */
  label: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const name = useId();
  // Slide only after a user change, so a stored value applied after hydration doesn't animate on load.
  const [touched, setTouched] = useState(false);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <fieldset
      className={cn(
        "relative isolate m-0 inline-grid auto-cols-fr grid-flow-col rounded-full bg-muted p-1",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 -z-10 rounded-full bg-card shadow-card ring-1 ring-border",
          touched && "transition-transform duration-(--dur-tab) ease-out-soft",
        )}
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => {
        const Icon = o.icon;
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            title={o.iconOnly ? o.label : undefined}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-(--dur-hover) has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-sm",
              checked
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => {
                setTouched(true);
                onValueChange(o.value);
              }}
              className="sr-only"
            />
            {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
            <span className={o.iconOnly ? "sr-only" : undefined}>
              {o.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
