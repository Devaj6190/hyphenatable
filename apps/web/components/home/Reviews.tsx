"use client";

import { Check, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CarryItem,
  NextPayroll,
  ReviewPerson,
  Stage1Review,
  Stage2Review,
} from "@/lib/view-types/home";
import { Avatar } from "./Card";

function ReviewHead({
  kicker,
  title,
  sub,
  action,
}: {
  kicker: string;
  title: string;
  sub: string;
  action: ReactNode;
}) {
  return (
    <div className="phone-actions flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[16px] bg-sunset px-6 py-6 text-sunset-ink shadow-[0_18px_40px_-22px_rgb(194_65_12/0.55)] sm:px-7">
      <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <span className="text-[11px] font-extrabold tracking-[0.07em] uppercase">
          {kicker}
        </span>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <span className="text-sunset-ink/85">{sub}</span>
      </div>
      {action}
    </div>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const signedPct = (n: number | null) =>
  n === null ? "new" : `${n > 0 ? "+" : n < 0 ? "−" : "+"}${Math.abs(n)}%`;

/** Width of a bar beside another, for the eye only. */
const share = (a: number, b: number | null) =>
  b === null ? 100 : Math.round((a / Math.max(a, b, 1)) * 100);

/** Review the draft (before Gate 1): what this payroll looks like, against the usual. */
export function ReviewDraft({
  review,
  dataKind,
  companyId,
  onApprove,
  locked,
}: {
  review: Stage1Review;
  dataKind: DataKind;
  companyId: string;
  onApprove: () => void;
  /** Why Gate 1 can't open (Gusto disconnected, a short pull); null when it can. */
  locked: string | null;
}) {
  const ls = review.laborShare;
  const diff =
    ls.nowPct !== null && ls.usualPct !== null
      ? Math.round((ls.nowPct - ls.usualPct) * 10) / 10
      : null;
  const groups: { key: ReviewPerson["group"]; label: string }[] = [
    { key: "hourly", label: "Hourly" },
    { key: "salary", label: "Salary" },
    { key: "venmo", label: "Venmo · paid outside Gusto" },
    { key: "held", label: "Held out of the draft" },
  ];
  const inDraft = review.people.filter(
    (p) => p.group === "hourly" || p.group === "salary",
  ).length;
  return (
    <section aria-labelledby="review-title" className="flex flex-col gap-5">
      <ReviewHead
        kicker="Review the draft · before Gate 1"
        title="Here's what this payroll looks like"
        sub={`${inDraft} people in the regular draft · Venmo listed separately`}
        action={
          <span className="phone-actions flex flex-col items-end gap-1 max-sm:w-full max-sm:items-stretch">
            <Button
              size="lg"
              onClick={onApprove}
              disabled={Boolean(locked)}
              className="h-12 px-6"
            >
              {locked && <Lock aria-hidden />}
              Approve Gate 1 ›
            </Button>
            {locked && <span className="text-xs font-semibold">{locked}</span>}
          </span>
        }
      />
      <h2 id="review-title" className="sr-only">
        Review the draft
      </h2>

      <div className="grid gap-4 rounded-card border bg-card p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">
            Labor as a share of revenue
          </span>
          <span className="text-4xl font-bold tabular-nums">
            {pct(ls.nowPct)}
          </span>
          {diff !== null && (
            <span
              className={cn(
                "text-sm font-semibold",
                diff > 0 ? "text-hold" : "text-ok",
              )}
            >
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(1)} pts vs your usual {pct(ls.usualPct)}
            </span>
          )}
          <p className="text-sm text-muted-foreground">
            <Money cents={review.laborCents} /> of labor on{" "}
            <Money cents={review.revenueCents} /> of revenue.
            {ls.leftOutJobIds.length > 0 &&
              ` Left out: ${ls.leftOutJobIds.join(", ")} (no revenue of its own).`}{" "}
            Worth a look, not a blocker.
          </p>
        </div>
        <div className="relative flex h-36 items-end gap-3 rounded-control bg-muted/60 px-4 pt-6 pb-2">
          {ls.cycles.map((c) => (
            <div
              key={c.label}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  c.now ? "text-link" : "text-muted-foreground",
                )}
              >
                {pct(c.pct)}
              </span>
              <span
                className={cn(
                  "block w-full max-w-12 rounded-t-[6px] motion-safe:animate-in motion-safe:slide-in-from-bottom-4",
                  c.now ? "bg-sunset" : "bg-border",
                )}
                style={{
                  height: `${Math.max(4, Math.round(((c.pct ?? 0) - 30) * 3))}px`,
                }}
              />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Compare
          label="Gusto gross"
          cents={review.grossCents}
          last={review.lastGrossCents}
          note="engine draft, before your answers"
        />
        <Compare
          label="Revenue"
          cents={review.revenueCents}
          last={null}
          note="Jobber invoices, jobs with revenue"
        />
        <Compare
          label="Labor cost"
          cents={review.laborCents}
          last={null}
          note="hours × cost rates"
        />
        <Compare
          label="Venmo"
          cents={review.venmoCents}
          last={review.lastVenmoCents}
          note="outside Gusto"
        />
      </div>

      <section className="flex flex-col rounded-card border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4">
          <h3 className="font-semibold">Pay per person</h3>
          <span className="text-sm text-muted-foreground">
            vs their usual (mean of the last 3 payrolls)
          </span>
          <span className="ml-auto flex gap-2 text-xs font-semibold">
            <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-destructive">
              {review.overUsual} over 25%
            </span>
            <span className="rounded-full bg-hold-soft px-2 py-0.5 text-hold">
              {review.withOvertime} with overtime
            </span>
          </span>
        </div>
        <div className="hidden grid-cols-[34px_minmax(0,1fr)_110px_110px_80px] gap-3 border-t px-5 py-2 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase sm:grid">
          <span />
          <span>Person</span>
          <span>Hours</span>
          <span className="text-right">Gross</span>
          <span className="text-right">Vs usual</span>
        </div>
        {groups.map((g) => {
          const rows = review.people.filter((p) => p.group === g.key);
          if (rows.length === 0) return null;
          return (
            <div key={g.key} className="flex flex-col">
              <div className="flex items-center gap-2 border-t bg-muted/50 px-5 py-1.5 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
                {g.label}
                <span>{rows.length}</span>
              </div>
              {rows.map((p, i) => {
                const big = Math.abs(p.vsUsualPct ?? 0) > 25;
                return (
                  <div
                    key={p.workerId}
                    className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t px-5 py-2.5 sm:grid-cols-[34px_minmax(0,1fr)_110px_110px_80px]"
                  >
                    <Avatar name={p.name} i={i} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.note && (
                        <span className="truncate text-xs text-muted-foreground">
                          {p.note}
                        </span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground max-sm:hidden">
                      {p.hours === null ? "" : `${p.hours} h`}
                      {(p.overtimeHours ?? 0) > 0 && (
                        <span className="ml-1.5 rounded bg-hold-soft px-1 text-xs font-semibold text-hold">
                          {p.overtimeHours} OT
                        </span>
                      )}
                    </span>
                    <span className="text-right font-semibold">
                      {p.grossCents === null ? (
                        <span className="text-destructive">No rate</span>
                      ) : (
                        <Money cents={p.grossCents} />
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-right text-sm font-semibold tabular-nums max-sm:col-start-3",
                        big ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {p.grossCents === null
                        ? "not paid"
                        : signedPct(p.vsUsualPct)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3 text-sm">
          <span className="text-muted-foreground">
            Corrections you approve are applied when the workbook is recomputed.
          </span>
          <Link
            href={`/c/${companyId}/workbook`}
            className="ml-auto font-medium text-link underline-offset-4 hover:underline"
          >
            How each number was worked out ›
          </Link>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Gross from the engine ({review.source}); labor and revenue from the job
        profit report. Gusto calculates taxes after the draft is filled.{" "}
        <DataLabel kind={dataKind} />
      </p>
    </section>
  );
}

function Compare({
  label,
  cents,
  last,
  note,
}: {
  label: string;
  cents: number;
  last: number | null;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Money cents={cents} className="text-2xl font-bold" />
      {last !== null && (
        <div
          aria-hidden
          className="grid grid-cols-[34px_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground"
        >
          <span>This</span>
          <span className="block h-1.5 rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-sunset"
              style={{ width: `${share(cents, last)}%` }}
            />
          </span>
          <span>Last</span>
          <span className="block h-1.5 rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-muted-foreground/40"
              style={{ width: `${share(last, cents)}%` }}
            />
          </span>
        </div>
      )}
      <span className="text-xs text-muted-foreground">
        {last !== null && (
          <>
            Last <Money cents={last} /> ·{" "}
          </>
        )}
        {note}
      </span>
    </div>
  );
}

/** Review commissions (before Gate 2): ready ones get Pay now / Hold; the rest wait on the customer. */
export function ReviewCommissions({
  stage2,
  dataKind,
  held,
  onHold,
  onApprove,
}: {
  stage2: Stage2Review;
  dataKind: DataKind;
  held: boolean;
  onHold: (held: boolean) => void;
  onApprove: () => void;
}) {
  const ready = stage2.commissions.filter((c) => c.state === "ready");
  const waiting = stage2.commissions.filter((c) => c.state === "waiting");
  return (
    <section className="flex flex-col gap-5">
      <ReviewHead
        kicker="Review commissions · before Gate 2"
        title="Job profit and commissions"
        sub={
          held || ready.length === 0
            ? "Nothing paid this run · held for next payroll"
            : `${ready.length} ready · ${waiting.length} waiting on customers`
        }
        action={
          <Button size="lg" className="h-12 px-6" onClick={onApprove}>
            {held || ready.length === 0
              ? "Finish without off-cycle ›"
              : "Approve Gate 2 ›"}
          </Button>
        }
      />
      <CommissionList
        title="Commissions and splits"
        meta={`Rules ${stage2.rules.join(", ")}`}
        dataKind={dataKind}
        rows={stage2.commissions.map((c) => ({
          id: c.id,
          initials: c.initials,
          title: c.title,
          sub: c.sub,
          amountCents: c.amountCents,
          right:
            c.state === "ready" ? (
              <PayHold held={held} onHold={onHold} name={`pay-${c.id}`} />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-hold">
                <span aria-hidden className="size-2 rounded-full bg-hold" />
                Waiting on customer
              </span>
            ),
          struck: c.state === "ready" && held,
        }))}
        foot="Anything held comes back on its own next payroll. Waiting ones are released once Jobber shows the customer paid."
      />
      <section className="flex flex-col rounded-card border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-3 px-5 py-4">
          <h3 className="font-semibold">Job profit</h3>
          <span className="text-sm text-muted-foreground">
            {stage2.jobs.length} jobs · Jobber and QuickBooks{" "}
            <DataLabel kind={dataKind} />
          </span>
        </div>
        <div className="hidden grid-cols-[minmax(0,1.4fr)_100px_100px_100px_minmax(0,1.3fr)] gap-3 border-t px-5 py-2 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase md:grid">
          <span>Job</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">Costs</span>
          <span className="text-right">Profit</span>
          <span>Margin</span>
        </div>
        {stage2.jobs.map((j, i) => (
          <div
            key={j.jobId}
            className="grid grid-cols-2 gap-x-3 gap-y-1 border-t px-5 py-3 md:grid-cols-[minmax(0,1.4fr)_100px_100px_100px_minmax(0,1.3fr)] md:items-center"
          >
            <span className="col-span-2 flex min-w-0 flex-col md:col-span-1">
              <span className="font-semibold">{j.label}</span>
              <span className="truncate text-sm text-muted-foreground">
                {j.title}
              </span>
            </span>
            <Cell label="Revenue" cents={j.revenueCents} />
            <Cell label="Costs" cents={j.costCents} />
            <Cell label="Profit" cents={j.profitCents} strong />
            <span className="col-span-2 flex flex-col gap-1 md:col-span-1">
              <span className="flex items-center gap-2">
                <span className="block h-2 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded motion-safe:animate-in motion-safe:slide-in-from-left-4",
                      j.low
                        ? "bg-destructive"
                        : (j.marginPct ?? 0) >= 100
                          ? "bg-border"
                          : "bg-sunset",
                    )}
                    style={{
                      width: `${Math.min(100, j.marginPct ?? 0)}%`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "w-14 text-right font-bold tabular-nums",
                    j.low && "text-destructive",
                  )}
                >
                  {pct(j.marginPct)}
                </span>
              </span>
              <span
                className={cn(
                  "text-xs",
                  j.low
                    ? "text-destructive"
                    : j.state === "ready"
                      ? "text-ok"
                      : "text-muted-foreground",
                )}
              >
                {j.note}
              </span>
            </span>
          </div>
        ))}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Source: {stage2.source}.
        </p>
      </section>
    </section>
  );
}

function Cell({
  label,
  cents,
  strong,
}: {
  label: string;
  cents: number | null;
  strong?: boolean;
}) {
  return (
    <span className="flex justify-between gap-2 text-sm md:block md:text-right">
      <span className="text-muted-foreground md:hidden">{label}</span>
      {cents === null ? (
        <span className="text-muted-foreground">unknown</span>
      ) : (
        <Money cents={cents} className={cn(strong && "font-semibold")} />
      )}
    </span>
  );
}

function PayHold({
  held,
  onHold,
  holdLabel = "Hold for next payroll",
  name,
}: {
  held: boolean;
  onHold: (h: boolean) => void;
  holdLabel?: string;
  name: string;
}) {
  return (
    <fieldset className="inline-flex rounded-[11px] bg-muted p-1">
      <legend className="sr-only">Pay now or hold</legend>
      {[
        { on: !held, label: "Pay now", v: false },
        { on: held, label: holdLabel, v: true },
      ].map((b) => (
        <label
          key={b.label}
          className={cn(
            "inline-flex min-h-9 cursor-pointer items-center rounded-[9px] px-3.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
            b.on
              ? "bg-card font-bold shadow-[0_1px_3px_rgb(26_31_54/0.18)]"
              : "font-semibold text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            checked={b.on}
            onChange={() => onHold(b.v)}
            className="sr-only"
          />
          {b.label}
        </label>
      ))}
    </fieldset>
  );
}

function CommissionList({
  title,
  meta,
  rows,
  foot,
  dataKind,
}: {
  title: string;
  meta: string;
  dataKind: DataKind;
  rows: {
    id: string;
    initials: string;
    title: string;
    sub: string;
    amountCents: number | null;
    right: ReactNode;
    struck: boolean;
    tag?: ReactNode;
  }[];
  foot: string;
}) {
  return (
    <section className="flex flex-col rounded-card border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 px-5 py-4">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm text-muted-foreground">
          {meta} <DataLabel kind={dataKind} />
        </span>
      </div>
      {rows.map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3.5"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-extrabold text-muted-foreground"
          >
            {c.initials}
          </span>
          <span className="flex min-w-[10rem] flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {c.title}
              {c.tag}
            </span>
            <span className="text-sm text-muted-foreground">{c.sub}</span>
          </span>
          <span
            className={cn(
              "min-w-20 text-right text-lg font-bold",
              (c.amountCents === null || c.struck) && "text-muted-foreground",
              c.struck && "line-through",
            )}
          >
            {c.amountCents === null ? "—" : <Money cents={c.amountCents} />}
          </span>
          <span className="flex w-full justify-end sm:w-auto">{c.right}</span>
        </div>
      ))}
      <p className="border-t bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
        {foot}
      </p>
    </section>
  );
}

/** Done: both drafts filled (or the regular one only), and what comes back next payroll. */
export function DonePanel({
  periodLabel,
  grossCents,
  offCycleCents,
  held,
  asked,
  corrections,
  carry,
  companyId,
  onNext,
  dataKind,
}: {
  periodLabel: string;
  grossCents: number | null;
  offCycleCents: number;
  held: boolean;
  asked: number;
  corrections: string[];
  carry: CarryItem[];
  companyId: string;
  onNext: (() => void) | null;
  dataKind: DataKind;
}) {
  return (
    <section className="flex flex-col gap-6 rounded-[22px] border bg-card p-6 shadow-card sm:p-8">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full bg-ok text-white dark:text-background"
        >
          <Check className="size-6" strokeWidth={3} />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-2xl font-bold tracking-tight">
            Payroll for {periodLabel} is ready in Gusto
          </span>
          <span className="text-muted-foreground">
            {held
              ? "The regular draft is filled. No off-cycle this time. Review and submit in Gusto; RollPay never submits."
              : "Both drafts are filled and calculated. Review and submit them in Gusto; RollPay never submits."}
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dd className="text-2xl font-bold">
            {grossCents === null ? "—" : <Money cents={grossCents} />}
          </dd>
          <dt className="text-sm text-muted-foreground">
            Regular draft · engine preview
          </dt>
        </div>
        <div className="flex flex-col gap-0.5">
          <dd className="text-2xl font-bold">
            <Money cents={offCycleCents} />
          </dd>
          <dt className="text-sm text-muted-foreground">
            {held ? "Off-cycle · held for next" : "Off-cycle · commissions"}
          </dt>
        </div>
        <div className="flex flex-col gap-0.5">
          <dd className="text-2xl font-bold tabular-nums">{asked}</dd>
          <dt className="text-sm text-muted-foreground">
            Questions this cycle
          </dt>
        </div>
        <div className="flex flex-col gap-0.5">
          <dd className="text-sm font-semibold">
            {corrections.length ? corrections.join(", ") : "None"}
          </dd>
          <dt className="text-sm text-muted-foreground">
            Corrections you approved
          </dt>
        </div>
      </dl>
      <div className="flex flex-col gap-2 rounded-card bg-muted/60 p-4">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <b className="font-semibold">Remembered for the next payroll</b>
          <span className="text-sm text-muted-foreground">
            Comes back on its own in the next run
          </span>
        </span>
        <ul className="flex flex-col gap-1.5">
          {carry.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 text-sm"
            >
              <span aria-hidden className="size-2 rounded-full bg-sunset-2" />
              <span className="font-medium">{c.title}</span>
              <span className="text-muted-foreground">{c.why}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="https://app.gusto.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-link underline-offset-4 hover:underline"
        >
          Open Gusto
        </a>
        <Link
          href={`/c/${companyId}/audit`}
          className="font-medium text-link underline-offset-4 hover:underline"
        >
          Audit log
        </Link>
        {onNext && (
          <Button variant="secondary" className="ml-auto" onClick={onNext}>
            Next payroll (example) ›
          </Button>
        )}
        <DataLabel kind={dataKind} />
      </div>
    </section>
  );
}

/** PR 8: Review commissions in the next payroll: released, still waiting, or held by you last time. */
export function NextReview({
  next,
  dataKind,
  held,
  onHold,
  approved,
  onApprove,
}: {
  next: NextPayroll;
  dataKind: DataKind;
  held: boolean;
  onHold: (h: boolean) => void;
  approved: boolean;
  onApprove: () => void;
}) {
  const TAG = {
    held: { label: "You held it", cls: "bg-accent text-link" },
    released: { label: "Released", cls: "bg-ok-soft text-ok" },
    waiting: { label: "Still waiting", cls: "bg-muted text-muted-foreground" },
  };
  const pay = next.rows.filter(
    (r) =>
      r.amountCents !== null &&
      (r.tag === "released" || (r.tag === "held" && !held)),
  );
  return (
    <section className="flex flex-col gap-5">
      <ReviewHead
        kicker="Review commissions · before Gate 2"
        title="Commissions for this payroll"
        sub={`${pay.length} ready · ${next.rows.filter((r) => r.tag === "waiting").length} still waiting on customers`}
        action={
          <Button
            size="lg"
            className="h-12 px-6"
            onClick={onApprove}
            disabled={approved}
          >
            Approve Gate 2 ›
          </Button>
        }
      />
      {approved && (
        <output className="rounded-card border border-ok/30 bg-ok-soft/60 px-5 py-3">
          Approved on this screen (example). The off-cycle draft gets{" "}
          {pay.length} {pay.length === 1 ? "line" : "lines"}:{" "}
          {pay.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Money cents={r.amountCents ?? 0} />
            </span>
          ))}
          . The waiting ones carry to the next payroll.
        </output>
      )}
      <CommissionList
        title="From last payroll"
        meta="Checked against Jobber · example"
        dataKind={dataKind}
        rows={next.rows.map((r) => ({
          id: r.id,
          initials: r.initials,
          title: r.title,
          sub: r.sub,
          amountCents: r.amountCents,
          struck: r.tag === "held" && held,
          tag: (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
                TAG[r.tag].cls,
              )}
            >
              {TAG[r.tag].label}
            </span>
          ),
          right:
            r.tag === "held" ? (
              <PayHold
                held={held}
                onHold={onHold}
                holdLabel="Hold again"
                name={`pay-${r.id}`}
              />
            ) : (
              <span
                className={cn(
                  "text-sm font-semibold",
                  r.tag === "released" ? "text-ok" : "text-hold",
                )}
              >
                {r.tag === "released"
                  ? "Ready to pay"
                  : "Carries to next payroll"}
              </span>
            ),
        }))}
        foot={`Commission amounts are worked out again by the engine when they're released, from the job's final profit. ${next.note}.`}
      />
    </section>
  );
}
