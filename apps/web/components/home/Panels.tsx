"use client";

import { Check, CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CarryItem, HomeBoardData, HomeCard } from "@/lib/view-types/home";
import { SystemMark } from "./Card";

const ease = (x: number) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;

export function Banner({
  tone,
  kicker,
  text,
  action,
}: {
  tone: "hold" | "ask" | "ok" | "destructive";
  kicker: string;
  text: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "ok" ? Check : tone === "ask" ? Info : CircleAlert;
  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-[14px] border px-5 py-4",
        tone === "hold" && "border-hold/30 bg-hold-soft/60",
        tone === "ask" && "border-ask/25 bg-ask-soft/60",
        tone === "ok" && "border-ok/25 bg-ok-soft/60",
        tone === "destructive" &&
          "border-destructive/30 bg-destructive-soft/70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px] border bg-card",
          tone === "hold" && "text-hold",
          tone === "ask" && "text-ask",
          tone === "ok" && "text-ok",
          tone === "destructive" && "text-destructive",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{kicker}</span>
        <span className="text-muted-foreground">{text}</span>
      </span>
      {action}
    </section>
  );
}

/** Before the run: the upcoming payroll, the run button, and last payroll. */
export function StartPanel({
  data,
  dataKind,
  companyId,
  onRun,
  running,
  carried,
  carriedFrom,
  disabledReason,
}: {
  data: HomeBoardData;
  dataKind: DataKind;
  companyId: string;
  onRun: () => void;
  running: boolean;
  /** Next payroll (PR 8): what the last run remembered. */
  carried?: CarryItem[];
  carriedFrom?: string;
  disabledReason?: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="relative flex flex-col gap-6 overflow-hidden rounded-[22px] border bg-card p-6 shadow-card sm:p-7">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[20%] -right-[6%] hidden h-[140%] w-[42%] bg-sunset opacity-95 [clip-path:polygon(38%_0,100%_0,100%_100%,0_100%)] md:block"
        />
        <div className="relative flex flex-wrap items-start gap-6 md:max-w-[60%]">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">
              Upcoming payroll · regular
            </span>
            <span className="text-4xl leading-tight font-bold tracking-tight">
              {data.periodLabel}
            </span>
            <span className="text-muted-foreground">
              {data.people.total} people · {data.people.gusto} in Gusto,{" "}
              {data.people.venmo} on Venmo
            </span>
          </div>
          {data.cutoffLabel && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Hours cutoff</dt>
              <dd className="font-semibold">{data.cutoffLabel}</dd>
            </dl>
          )}
        </div>
        <div className="phone-actions relative flex flex-wrap items-center gap-4 md:max-w-[60%]">
          <Button
            size="lg"
            className="h-12 px-6 text-base"
            onClick={onRun}
            disabled={running || Boolean(disabledReason)}
          >
            Run this payroll
          </Button>
          <span className="max-w-md text-sm text-muted-foreground">
            {disabledReason ??
              "We pull Jobber, QuickBooks and Gusto, run 23 checks and tell you what needs you. Nothing is submitted."}
          </span>
        </div>
        <span className="relative text-xs text-muted-foreground">
          Cycle dates from data/fixtures/{companyId}/cycles.json{" "}
          <DataLabel kind={dataKind} />
        </span>
      </section>

      {carried && carried.length > 0 && (
        <section className="flex flex-col gap-3 rounded-card border bg-card p-5 shadow-card">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold">
              Carried over from {carriedFrom}
            </h2>
            <p className="text-sm text-muted-foreground">
              RollPay remembered these. They come back in this run on their own.
            </p>
          </div>
          <ul className="flex flex-col">
            {carried.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t py-2.5 first:border-t-0"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-sunset-2"
                />
                <span className="min-w-0 flex-1 font-medium">{c.title}</span>
                {c.amountCents !== null && (
                  <Money cents={c.amountCents} className="font-semibold" />
                )}
                <span className="w-full pl-5 text-sm text-muted-foreground sm:w-auto sm:pl-0">
                  {c.why}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Each one is checked again in Stage 2: paid jobs release their
            commissions, your held items come back for a yes or no.
          </p>
        </section>
      )}

      {data.last && (
        <section className="flex flex-col gap-3 rounded-card border bg-card p-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-semibold">Last payroll</h2>
            <span className="text-sm text-muted-foreground">
              {data.last.periodLabel} · paid in Gusto and Venmo
            </span>
            <Link
              href={`/c/${companyId}/audit`}
              className="ml-auto text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              History ›
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label={`Gusto gross · ${data.last.people} people`}>
              <Money cents={data.last.grossCents} />
            </Tile>
            <Tile label="Venmo">
              <Money cents={data.last.venmoCents} />
            </Tile>
            <Tile label="Off-cycle (commissions)">
              <Money cents={data.last.offCycleCents} />
            </Tile>
            <Tile label="Questions asked">{data.last.questionsAsked}</Tile>
          </dl>
          <span className="text-xs text-muted-foreground">
            From the paid records in app/_fixtures/workbook.json{" "}
            <DataLabel kind={dataKind} />
          </span>
        </section>
      )}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dd className="text-2xl font-bold tabular-nums">{children}</dd>
      <dt className="text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}

export const RUN_END = 112;
const CHECK_START = 22;

/** Collecting, then Checking. Counts are the cycle's real pulls and flags; only the pace is animated. */
export function RunPanel({
  run,
  t,
  onSkip,
}: {
  run: HomeBoardData["run"];
  t: number;
  onSkip: () => void;
}) {
  const windows = [
    [1, 22],
    [4, 14],
    [6, 18],
  ];
  const step = (RUN_END - CHECK_START - 4) / run.checks;
  let k = 0;
  let issues = 0;
  let doing: string | null = null;
  const groups = run.groups.map((g) => {
    const s0 = CHECK_START + k * step;
    const e = s0 + g.checks * step;
    k += g.checks;
    const done = t >= e;
    const active = t >= s0 && !done;
    const part = active ? Math.floor((t - s0) / step) : done ? g.checks : 0;
    const found = done ? g.found : Math.round((g.found * part) / g.checks);
    issues += found;
    if (active) doing = g.label;
    return { ...g, done, active, part, found };
  });
  const p = Math.min(1, t / RUN_END);
  const checking = t >= CHECK_START;
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-6 overflow-hidden rounded-[22px] bg-sunset p-6 text-sunset-ink sm:p-10"
    >
      <div className="flex flex-col gap-3">
        <span className="self-start rounded-full bg-white/30 px-2.5 py-0.5 text-xs font-bold">
          {checking ? "Checking · step 2 of 8" : "Collecting · step 1 of 8"}
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold">
            {!checking
              ? "Pulling this cycle from Jobber, QuickBooks and Gusto…"
              : doing
                ? `${doing}…`
                : t >= RUN_END
                  ? `${run.checks} checks done`
                  : "Starting checks…"}
          </span>
          <span className="font-bold tabular-nums">{Math.round(p * 100)}%</span>
        </div>
        <span className="block h-1.5 overflow-hidden rounded-full bg-white/35">
          <span
            className="block h-full rounded-full bg-sunset-ink"
            style={{ width: `${(p * 100).toFixed(1)}%` }}
          />
        </span>
      </div>
      <div className="grid gap-4 rounded-[18px] bg-card/95 p-5 text-foreground md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex gap-5">
          {run.pulls.map((pull, i) => {
            const [a, b] = windows[i] ?? [1, 22];
            const f = ease((t - a) / (b - a));
            const done = t >= b;
            return (
              <span
                key={pull.system}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="relative block size-14">
                  <svg
                    viewBox="0 0 64 64"
                    className="size-14"
                    aria-hidden="true"
                  >
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      strokeWidth="6"
                      strokeLinecap="round"
                      transform="rotate(-90 32 32)"
                      stroke={done ? "var(--ok)" : "var(--sunset-2)"}
                      strokeDasharray="163.4"
                      strokeDashoffset={(163.4 * (1 - f)).toFixed(1)}
                    />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center">
                    <SystemMark system={pull.system} size={26} />
                  </span>
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {Math.round(f * pull.pulled)} of {pull.expected ?? "?"}
                </span>
              </span>
            );
          })}
        </div>
        <ul className="flex flex-col gap-1">
          {groups.map((g) => (
            <li
              key={g.label}
              className={cn(
                "flex min-h-8 items-center gap-2.5 rounded-lg px-3 transition-colors",
                g.active
                  ? "bg-accent font-semibold text-link"
                  : g.done
                    ? ""
                    : "text-muted-foreground",
              )}
            >
              <span className="flex-1">{g.label}</span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  g.done ? "text-hold" : "text-ask",
                )}
              >
                {g.done
                  ? `${g.found} found`
                  : g.active
                    ? `${g.part} of ${g.checks}`
                    : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold text-hold tabular-nums">
            {issues}
          </span>
          <span className="text-sm text-muted-foreground">need attention</span>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={onSkip}
      >
        Skip animation
      </Button>
    </section>
  );
}

export const RECON_END = 66;

/** Reconciling: payments, expenses, quotes, then profit per job. Margins are the engine's. */
export function ReconPanel({
  stage2,
  cards,
  rt,
}: {
  stage2: NonNullable<HomeBoardData["stage2"]>;
  cards: HomeCard[];
  rt: number;
}) {
  const by = (ids: string[]) =>
    cards.filter((c) => ids.includes(c.checkId)).length;
  const PH = [
    {
      label: "Payments matched to invoices",
      found: by(["CHK-19"]),
      a: 0,
      b: 12,
    },
    {
      label: "Expenses matched to jobs",
      found: by(["CHK-14", "CHK-15", "CHK-17"]),
      a: 12,
      b: 27,
    },
    { label: "Quotes and who sold them", found: by(["CHK-20"]), a: 27, b: 35 },
    { label: "Profit per job", found: by(["CHK-21"]), a: 35, b: 60 },
  ];
  const jobs = stage2.jobs.filter((j) => j.marginPct !== null);
  const p = Math.min(1, rt / 60);
  const need = PH.filter((x) => rt >= x.b).reduce((s, x) => s + x.found, 0);
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-6 rounded-[22px] bg-sunset p-6 text-sunset-ink sm:p-10"
    >
      <div className="flex flex-col gap-3">
        <span className="self-start rounded-full bg-white/30 px-2.5 py-0.5 text-xs font-bold">
          Reconciling · step 6 of 8
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold">
            {rt >= 60
              ? `Reconciled ${jobs.length} jobs. ${need} things need you.`
              : (PH.find((x) => rt >= x.a && rt < x.b)?.label ?? "Starting") +
                "…"}
          </span>
          <span className="font-bold tabular-nums">{Math.round(p * 100)}%</span>
        </div>
        <span className="block h-1.5 overflow-hidden rounded-full bg-white/35">
          <span
            className="block h-full rounded-full bg-sunset-ink"
            style={{ width: `${(p * 100).toFixed(1)}%` }}
          />
        </span>
      </div>
      <div className="grid gap-4 rounded-[18px] bg-card/95 p-5 text-foreground md:grid-cols-2">
        <ul className="flex flex-col gap-1.5">
          {PH.map((x) => {
            const done = rt >= x.b;
            const active = rt >= x.a && !done;
            return (
              <li
                key={x.label}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[10px] px-3",
                  active
                    ? "bg-accent text-link"
                    : done
                      ? ""
                      : "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5.5 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white",
                    done
                      ? x.found
                        ? "bg-hold"
                        : "bg-ok"
                      : active
                        ? "ring-2 ring-sunset-2 ring-inset"
                        : "ring-[1.5px] ring-border ring-inset",
                  )}
                >
                  {done ? (x.found ? "!" : "✓") : ""}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">{x.label}</span>
                  <span
                    className={cn(
                      "text-xs",
                      done && x.found
                        ? "font-semibold text-hold"
                        : "text-muted-foreground",
                    )}
                  >
                    {done
                      ? x.found
                        ? `${x.found} to look at`
                        : "all matched"
                      : active
                        ? "in progress"
                        : "waiting"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-col">
          <li className="grid grid-cols-[64px_1fr_60px] gap-2.5 px-1 pb-1 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
            <span>Job</span>
            <span>Margin</span>
            <span className="text-right">%</span>
          </li>
          {jobs.map((j, i) => {
            const shown = rt >= 35 + i * 3.4;
            const odd = (j.marginPct ?? 0) >= 100;
            return (
              <li
                key={j.jobId}
                className={cn(
                  "grid grid-cols-[64px_1fr_60px] items-center gap-2.5 border-t px-1 py-2 transition-opacity",
                  !shown && "opacity-35",
                )}
              >
                <span className="text-sm font-semibold">
                  {j.label.replace("Job ", "")}
                </span>
                <span className="block h-2.5 overflow-hidden rounded-[5px] bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-[5px] transition-[width] duration-500",
                      j.low ? "bg-destructive" : odd ? "bg-hold" : "bg-primary",
                    )}
                    style={{
                      width: `${shown ? Math.min(100, j.marginPct ?? 0) : 0}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "text-right text-sm font-bold tabular-nums",
                    j.low && "text-destructive",
                  )}
                >
                  {shown ? `${(j.marginPct ?? 0).toFixed(1)}%` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export const FILL_END = 30;

export function FillPanel({
  steps,
  ft,
  note,
}: {
  steps: string[];
  ft: number;
  note: string | null;
}) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 rounded-[22px] border bg-card p-6 shadow-card sm:p-8"
    >
      <span className="text-xl font-semibold">
        {ft >= FILL_END ? "Draft filled" : "Filling the Gusto draft…"}
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary"
          style={{
            width: `${Math.min(100, (ft / FILL_END) * 100).toFixed(1)}%`,
          }}
        />
      </span>
      <ul className="flex flex-col gap-1">
        {steps.map((label, i) => {
          const done = ft >= (i + 1) * 10;
          const act = ft >= i * 10 && !done;
          return (
            <li
              key={label}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-[10px] px-3",
                act
                  ? "bg-accent font-semibold text-link"
                  : done
                    ? ""
                    : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-5.5 place-items-center rounded-full text-xs font-extrabold text-white",
                  done
                    ? "bg-ok"
                    : act
                      ? "ring-2 ring-sunset-2 ring-inset"
                      : "ring-[1.5px] ring-border ring-inset",
                )}
              >
                {done ? "✓" : ""}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        RollPay prepares, updates and calculates the draft. It never submits.
        {note ? ` ${note}` : ""}
      </p>
    </section>
  );
}
