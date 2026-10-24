"use client";

import { type DataKind, DataLabel } from "@/components/DataLabel";
import { SimulatedChip } from "@/components/SimulatedChip";
import { Card, CardContent } from "@/components/ui/card";
import { useDemoLocal } from "@/lib/demoLocal";
import { fixtureMessages, workerName } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

// Texts only: who, when, words. No pay, no phone numbers. Fixture messages plus anything recorded in this
// browser (demo panel replies, answers given in the inbox), so a reply shows up the moment it is recorded.
// `title` (+ `dataKind`) wraps the thread in its own card, as the problem detail page uses it.
export function WorkerThread({
  questionId,
  timeZone = "America/Los_Angeles",
  title,
  dataKind,
}: {
  questionId: string;
  timeZone?: string;
  title?: string;
  dataKind?: DataKind;
}) {
  const local = useDemoLocal();
  const messages = [...fixtureMessages, ...local.messages]
    .filter((m) => m.questionId === questionId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (messages.length === 0) return null;
  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  const thread = (
    <ol aria-label="Texts" className="flex flex-col gap-3">
      {messages.map((m) => {
        const out = m.direction === "out";
        return (
          <li
            key={m.id}
            className={cn(
              "flex max-w-[85%] flex-col gap-1",
              out ? "self-start" : "items-end self-end",
            )}
          >
            <p
              className={cn(
                "rounded-2xl px-3.5 py-2 text-[0.9375rem]",
                out ? "rounded-bl-md bg-muted" : "rounded-br-md bg-accent",
              )}
            >
              {m.text}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {out
                ? "PayrollPilot"
                : m.simulated
                  ? "Simulated reply"
                  : workerName(m.workerId)}
              <span aria-hidden>·</span>
              <time dateTime={m.at}>{when.format(new Date(m.at))}</time>
              {m.simulated && <SimulatedChip />}
            </p>
            {m.interpretation && (
              <p className="text-sm text-foreground">{m.interpretation}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
  if (!title) return thread;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {title} · {workerName(messages[0].workerId)}
          {dataKind && <DataLabel kind={dataKind} />}
        </h2>
        {thread}
      </CardContent>
    </Card>
  );
}
