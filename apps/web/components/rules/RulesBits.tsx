import { Info } from "lucide-react";

/** Decisions are browser-only until rules.approve / rules.toggle exist in Convex. Say so on screen. */
export function PreviewNote() {
  return (
    <p className="flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      Preview: your decisions stay in this browser tab until the rules functions
      are live. Nothing is sent anywhere.
    </p>
  );
}

export function RulesEmpty({ label }: { label: string }) {
  return (
    <div className="rounded-card border border-dashed border-input bg-card p-6">
      <p className="font-medium">No rules for {label} yet.</p>
      <p className="mt-1 text-muted-foreground">
        Rules appear here once past payrolls are read from Gusto.
      </p>
    </div>
  );
}
