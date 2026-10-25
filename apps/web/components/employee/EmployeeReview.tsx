"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { EV, employeeAnswer } from "@/components/manager/inboxState";
import { Button } from "@/components/ui/button";
import { LOCAL_SOURCE, recordLocal, useDemoLocal } from "@/lib/demoLocal";
import { cn } from "@/lib/utils";
import type { EmployeeReviewData } from "@/lib/view-types/manager";

// The page behind the link in a worker's text: one question about their own hours, then their hours for the
// period. Hours and jobs only, never pay. ponytail: the answer is recorded in this browser until employee
// answer links exist (Devaj, need (i)); the manager inbox reads it from there.
export function EmployeeReview({
  data,
  dataKind,
}: {
  data: EmployeeReviewData;
  dataKind: DataKind;
}) {
  const id = useId();
  const local = useDemoLocal();
  const q = data.question;
  const answered = q
    ? employeeAnswer(
        q.flagId,
        local.events.filter((e) => e.companyId === data.companyId),
      )
    : null;
  const [pick, setPick] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const manager = data.managerFirstName ?? "your manager";
  const other = q !== null && pick !== null && pick === q.otherOption;
  const ready = pick !== null && (!other || (from !== "" && to !== ""));
  const maxWeek = Math.max(40, ...data.weeks.map((w) => w.hours));

  const record = (type: string, summary: string, refs = {}) =>
    q &&
    recordLocal({
      event: {
        companyId: data.companyId,
        cycleId: null,
        actor: { kind: "user", id: data.worker.id, agent: null },
        type,
        summary,
        refs: { flagId: q.flagId, ...refs },
        data: { source: `Employee page, ${LOCAL_SOURCE}` },
      },
    });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-background">
      <header className="flex flex-col gap-3.5 bg-sunset px-4.5 pt-5.5 pb-7 text-sunset-ink">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-lg bg-[#1A1F36] text-xs font-extrabold text-white"
          >
            RP
          </span>
          <span className="text-[0.9375rem] font-bold">RollPay</span>
          <span className="ml-auto text-xs font-semibold opacity-85">
            for {data.companyName}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">
            Hi {data.worker.firstName}
          </h1>
          <p className="text-[0.9375rem] leading-snug">
            {q
              ? `${manager} asked us to check one thing about your hours before payday.`
              : `Here are your hours for ${data.period}.`}
          </p>
        </div>
      </header>

      <main className="-mt-3.5 flex flex-col gap-3.5 px-3.5 pb-10">
        {q && !answered && (
          <article className="flex animate-in flex-col overflow-hidden rounded-[18px] bg-card shadow-raised duration-(--dur-sheet) fade-in slide-in-from-bottom-2">
            <div aria-hidden className="h-[5px] bg-sunset" />
            <div className="flex flex-col gap-3.5 p-4.5">
              <span className="text-[11px] font-extrabold tracking-[0.07em] text-link uppercase">
                1 of 1 · {q.eyebrow}
              </span>
              <h2 id={`${id}-q`} className="text-xl leading-snug font-bold">
                {q.text}
              </h2>
              {q.bars.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div
                    role="img"
                    aria-label={`${q.bars.map((b) => b.label).join(" and ")}${q.overlap ? `, overlapping from ${q.overlap.label}` : ""}`}
                    className="relative h-[62px] rounded-xl bg-background"
                  >
                    {q.bars.map((b, k) => (
                      <span
                        key={b.recordId}
                        className="absolute flex h-5 items-center rounded-[7px] border-[1.5px] border-foreground bg-card pl-2 text-[11px] font-bold whitespace-nowrap"
                        style={{
                          left: `${b.from * 100}%`,
                          width: `${(b.to - b.from) * 100}%`,
                          top: k === 0 ? 8 : 34,
                        }}
                      >
                        {b.label}
                      </span>
                    ))}
                    {q.overlap && (
                      <span
                        className="absolute inset-y-1 rounded-lg border-[1.5px] border-dashed border-link bg-sunset-2/20"
                        style={{
                          left: `${q.overlap.from * 100}%`,
                          width: `${(q.overlap.to - q.overlap.from) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="flex justify-between text-[11px] text-muted-foreground"
                  >
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                  </span>
                </div>
              )}
              <p className="text-[0.8125rem] text-muted-foreground">
                {q.detail}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${id}-q`}
                className="flex flex-col gap-2"
              >
                {q.options.map((o, k) => (
                  // biome-ignore lint/a11y/useSemanticElements: a full-width tap target with its own dot; aria-checked carries the state.
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={pick === k}
                    onClick={() => setPick(k)}
                    className={cn(
                      "pressable flex min-h-[60px] items-center gap-3 rounded-[14px] border-2 px-3.5 py-2.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      pick === k
                        ? "border-sunset-2 bg-accent"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-[22px] shrink-0 rounded-full bg-card",
                        pick === k
                          ? "border-[7px] border-sunset-2"
                          : "border-2 border-input",
                      )}
                    />
                    <span className="flex flex-1 flex-col">
                      <span className="text-base font-semibold">{o.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {other && (
                <div className="grid animate-in grid-cols-2 gap-2 fade-in">
                  {(
                    [
                      ["Started", from, setFrom],
                      ["Finished", to, setTo],
                    ] as const
                  ).map(([label, value, set]) => (
                    <label
                      key={label}
                      className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground"
                    >
                      {label}
                      <input
                        type="time"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="min-h-12 rounded-xl border-[1.5px] border-input bg-card px-3 text-base text-foreground"
                      />
                    </label>
                  ))}
                </div>
              )}
              <Button
                size="lg"
                disabled={!ready}
                className="min-h-[54px] rounded-[14px] text-[1.0625rem] font-bold"
                onClick={() => {
                  if (pick === null || !ready) return;
                  const answer = other
                    ? `Something else: ${from} to ${to}`
                    : q.options[pick].label;
                  record(
                    EV.employee,
                    `${data.worker.firstName} answered on the employee page: ${answer}. Goes to ${manager} to confirm.`,
                    { option: String(pick), answer },
                  );
                }}
              >
                {ready ? `Send to ${manager}` : "Pick one to continue"}
              </Button>
            </div>
          </article>
        )}

        {q && answered && (
          <article
            aria-live="polite"
            className="flex animate-in flex-col items-center gap-3 rounded-[18px] bg-card px-5 py-6.5 text-center shadow-raised fade-in"
          >
            <span className="flex size-[60px] items-center justify-center rounded-full bg-ok text-background">
              <Check aria-hidden className="size-[30px]" strokeWidth={2.8} />
            </span>
            <h2 className="text-[1.375rem] font-bold">
              Thanks, {data.worker.firstName}
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              Sent to {manager}:{" "}
              <b className="text-foreground">{answered.answer}</b>. {manager}{" "}
              confirms it. Nothing else needed from you.
            </p>
            <Button
              variant="quiet"
              onClick={() => {
                setPick(null);
                record(
                  EV.employeeUndone,
                  `${data.worker.firstName} took back the answer on the employee page.`,
                );
              }}
            >
              Change my answer
            </Button>
          </article>
        )}

        <section className="flex flex-col gap-2.5 rounded-[18px] border bg-card p-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold">Your hours, {data.period}</h2>
            <span className="ml-auto text-[0.8125rem] text-muted-foreground">
              from Jobber
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.weeks.map((w) => (
              <div
                key={w.label}
                className="flex flex-col gap-1.5 rounded-xl bg-background p-3"
              >
                <span className="text-xs text-muted-foreground">{w.label}</span>
                <span className="text-[1.375rem] font-bold tabular-nums">
                  {w.hours} h
                </span>
                <span
                  aria-hidden
                  className="block h-1.5 overflow-hidden rounded-[3px] bg-border"
                >
                  <span
                    className="block h-full bg-sunset"
                    style={{ width: `${(w.hours / maxWeek) * 100}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5">
            {data.days.map((d) => (
              <li
                key={d.recordIds[0]}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                  d.flagged ? "border-sunset-2/40 bg-accent" : "bg-card",
                )}
              >
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {d.day}
                    {d.flagged && (
                      <span className="rounded-full bg-sunset-2 px-1.5 py-px text-[10px] font-extrabold text-sunset-ink">
                        CHECK
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.detail}
                  </span>
                </span>
                <span className="text-[0.9375rem] font-bold tabular-nums">
                  {d.hours} h
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Something else wrong or missing? Tell {manager}, or reply to the
            text. Hours only; pay isn't shown here. Hours change only after{" "}
            {manager} confirms.
          </p>
        </section>

        <footer className="flex flex-col items-center gap-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">
          <DataLabel kind={dataKind} detail={`${data.companyName} demo`} />
          <p>
            This link is for you and {manager}. Source: {data.source}. Answers
            are kept in {LOCAL_SOURCE}.
          </p>
        </footer>
      </main>
    </div>
  );
}
