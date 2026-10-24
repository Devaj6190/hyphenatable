import type { DataKind } from "@/components/DataLabel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fixtureMessages, workerName } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

// Texts only: worker, time, words. No pay, no phone numbers.
export function WorkerThread({
  questionId,
  title,
  dataKind,
}: {
  questionId: string;
  title: string;
  dataKind: DataKind;
}) {
  const messages = fixtureMessages
    .filter((m) => m.questionId === questionId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (messages.length === 0) return null;
  const who = workerName(messages[0].workerId);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {title} · {who}
        </h2>
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "flex max-w-xl flex-col gap-1 rounded-lg p-3 text-sm",
                m.direction === "out"
                  ? "self-start bg-muted"
                  : "self-end bg-ok-soft",
              )}
            >
              <span>{m.text}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {m.direction === "out" ? "PayrollPilot" : who} ·{" "}
                {when.format(new Date(m.at))} · {dataKind}
                {m.simulated && (
                  <Badge
                    variant="outline"
                    className="border-destructive text-destructive"
                  >
                    Simulated
                  </Badge>
                )}
              </span>
              {m.interpretation && (
                <span className="text-xs">{m.interpretation}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
