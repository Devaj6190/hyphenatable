import type { countFlags } from "@/lib/home";
import { cn } from "@/lib/utils";

// Clean / fixed / open / held for this cycle. Status words carry the meaning; tone only backs them up.
export function Counts({
  counts,
  source,
}: {
  counts: ReturnType<typeof countFlags>;
  source: string;
}) {
  const tiles = [
    {
      label: "Clean",
      value: counts.clean ?? "–",
      note:
        counts.clean === null
          ? "No records pulled yet"
          : `of ${counts.checked} records, no problem`,
    },
    { label: "Fixed", value: counts.fixed, note: "corrected and approved" },
    {
      label: "Open",
      value: counts.open,
      note: `${counts.needsYou} ${counts.needsYou === 1 ? "needs" : "need"} you · ${counts.waiting} waiting`,
      tone: counts.needsYou > 0 && "text-hold",
    },
    {
      label: "Held",
      value: counts.held,
      note: counts.held ? "only these items wait" : "nothing held",
      tone: counts.held > 0 && "text-hold",
    },
  ];
  return (
    <section aria-labelledby="counts-title" className="flex flex-col gap-3">
      <h2
        id="counts-title"
        className="text-sm font-medium text-muted-foreground"
      >
        This cycle so far
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border bg-border">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5 bg-card p-4">
            <dt className="text-sm text-muted-foreground">{t.label}</dt>
            <dd
              className={cn(
                "text-3xl leading-none font-semibold tabular-nums",
                t.tone,
              )}
            >
              {t.value}
            </dd>
            <dd className="text-xs text-muted-foreground">{t.note}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Clean = records pulled this cycle that no check flagged. Source:{" "}
        {source}.
      </p>
    </section>
  );
}
