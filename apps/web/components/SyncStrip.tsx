import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { clock, objectWord, SOURCES, type SyncRun } from "@/lib/home";
import { cn } from "@/lib/utils";

// Pulled vs expected for every SyncRun of the cycle, per source. An incomplete run is red and says what
// it blocks. `detailed` adds the method, sync time and error (the Inputs page).
export function SyncStrip({
  runs,
  timeZone,
  companyId,
  detailed = false,
}: {
  runs: SyncRun[];
  timeZone: string;
  companyId: string;
  detailed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!detailed && (
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Pulled for this payroll
          </h2>
          <Link
            href={`/c/${companyId}/inputs`}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            See every input
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {SOURCES.map(({ key, system }) => {
          const own = runs.filter((r) => r.source === key);
          const incomplete = own.filter((r) => !r.complete);
          const last = own
            .map((r) => r.finishedAt)
            .filter((t): t is string => Boolean(t))
            .sort()
            .at(-1);
          return (
            <section
              key={key}
              aria-label={`${system} sync`}
              className={cn(
                "flex flex-col gap-2 rounded-control border px-3 py-2.5",
                incomplete.length
                  ? "border-destructive bg-sync-error-soft"
                  : "bg-card",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{system}</h3>
                {own.length === 0 ? (
                  <StatusBadge status="closed" label="Not pulled yet" />
                ) : incomplete.length ? (
                  <StatusBadge status="sync-incomplete" />
                ) : (
                  <StatusBadge status="verified" label="Complete" />
                )}
                {last && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {clock(last, timeZone)}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {own.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-2"
                  >
                    <span
                      className={cn(
                        "tabular-nums",
                        r.complete
                          ? "text-muted-foreground"
                          : "text-destructive",
                      )}
                    >
                      <span className="font-medium text-foreground">
                        {r.pulled}
                      </span>{" "}
                      of {r.expected ?? "unknown"} {objectWord(r.object)}
                    </span>
                    {detailed && <SourceChip system={system} recordId={r.id} />}
                    {!r.complete && (
                      <span className="w-full text-destructive">
                        Blocks {objectWord(r.object)} until the next pull
                        matches.
                      </span>
                    )}
                    {detailed && (
                      <span className="w-full text-xs text-muted-foreground">
                        Counted by {r.method}
                        {r.error && ` · ${r.error}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
