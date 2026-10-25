import type { DataKind } from "@/components/DataLabel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatWhen } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ThreadView } from "@/lib/view-types";

// Texts only: worker, time, words. No pay, no phone numbers. Keyed by questionId (not the first message), so a
// question with no server messages yet still renders once replies for it arrive. Nothing to show → nothing rendered.
export function WorkerThread({
  thread,
  questionId = thread?.messages[0]?.questionId,
  workerName,
  title,
  dataKind,
  timezone,
}: {
  thread: ThreadView | null;
  questionId?: string;
  /** Header name when the server has no thread yet. */
  workerName?: string;
  title: string;
  dataKind: DataKind;
  timezone: string;
}) {
  const who = thread?.workerName ?? workerName ?? "Recipient";
  const messages = (thread?.messages ?? []).filter(
    (m) => m.questionId === questionId,
  );
  if (messages.length === 0) return null;
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
                {formatWhen(m.at, timezone)} · {dataKind}
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
