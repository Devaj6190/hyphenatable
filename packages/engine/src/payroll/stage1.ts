// A-10 Stage 1: entries, workers and active rules → the Gusto draft lines, the Venmo list, and a
// per-worker arithmetic trail. Pure: no IO, no clock, no model. Unknown → held with a reason, never zero.
import { bucketHours, localDate, workweekAnchor } from "./hours";
import { centsFor, fmtH, hours2 } from "./money";
import {
  parseOvertimePolicy,
  type Split,
  splitWeek,
  worksSevenDays,
} from "./overtime";
import { payRate, venmoRate } from "./rates";
import { pendingReimbursements } from "./reimbursements";
import { salaryPerPeriod } from "./salaried";
import type {
  Cycle,
  DraftLine,
  Earning,
  HourlyName,
  Rule,
  Stage1Options,
  Stage1Result,
  TimeEntry,
  VenmoRow,
  Worker,
  WorkerPay,
} from "./types";

const HOURLY: { name: HourlyName; multiplier: number; label: string }[] = [
  { name: "Regular Hours", multiplier: 1, label: "regular" },
  { name: "Overtime", multiplier: 1.5, label: "overtime" },
  { name: "Double Overtime", multiplier: 2, label: "double overtime" },
];

const uniq = (xs: string[]) => [...new Set(xs)].sort();

export function computeStage1(
  cycle: Cycle,
  entries: TimeEntry[],
  workers: Worker[],
  rules: Rule[],
  opts: Stage1Options,
): Stage1Result {
  const tz = opts.company.timezone;
  const draftId = opts.draftId ?? `${cycle.id}-draft-s1`;
  const memo = `PayrollPilot draft ${draftId}`;
  const periodStartDay = localDate(cycle.periodStart, tz);
  const periodEndDay = localDate(cycle.periodEnd, tz);
  const ot = parseOvertimePolicy(rules);
  const { anchor, source: anchorSource } = workweekAnchor(
    periodStartDay,
    ot.ok ? ot.policy.workweek : null,
  );

  // Holds: explicit entry ids, plus held flags (entry-level, or worker-level when no entry ids).
  const held = new Set(opts.heldEntryIds ?? []);
  const flagsByEntry = new Map<string, string[]>();
  const flagsByWorker = new Map<string, string[]>();
  for (const f of opts.heldFlags ?? []) {
    if (f.status !== "held") continue;
    for (const id of f.subject.entryIds) {
      held.add(id);
      flagsByEntry.set(id, [...(flagsByEntry.get(id) ?? []), f.id]);
    }
    const w = f.subject.workerId;
    if (w && f.subject.entryIds.length === 0)
      flagsByWorker.set(w, [...(flagsByWorker.get(w) ?? []), f.id]);
  }

  const { byWorker, skipped } = bucketHours(entries, {
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    timeZone: tz,
    anchor,
    held,
  });
  const reimbursements = pendingReimbursements(
    opts.expenses ?? [],
    periodEndDay,
  );

  const explain: Record<string, string[]> = {};
  const pay: Record<string, WorkerPay> = {};
  const lines: DraftLine[] = [];
  const venmoList: VenmoRow[] = [];
  const say = (w: string, s: string) => {
    if (!explain[w]) explain[w] = [];
    explain[w].push(`${w}: ${s}`);
  };

  const known = new Map(workers.map((w) => [w.id, w]));
  const ids = uniq([
    ...workers.map((w) => w.id),
    ...byWorker.keys(),
    ...skipped.map((s) => s.workerId),
    ...reimbursements.map((r) => r.workerId),
  ]);

  for (const id of ids) {
    const worker = known.get(id);
    const hrs = byWorker.get(id);
    const mySkipped = skipped.filter((s) => s.workerId === id);
    const myReimb = reimbursements.filter((r) => r.workerId === id);
    if (!worker) {
      say(
        id,
        "entries or expenses for a worker not in the worker list; nothing paid",
      );
      pay[id] = blank(id, "none", "unknown worker");
      continue;
    }
    if (
      worker.status === "inactive" &&
      !hrs &&
      mySkipped.length === 0 &&
      myReimb.length === 0
    )
      continue;

    for (const s of mySkipped)
      say(id, `entry ${s.entryId} left out: ${s.reason}`);
    const heldFlagIds = uniq([
      ...(flagsByWorker.get(id) ?? []),
      ...mySkipped.flatMap((s) => flagsByEntry.get(s.entryId) ?? []),
    ]);
    const seconds = hrs?.seconds ?? 0;
    const allHeld =
      seconds === 0 && !hrs && mySkipped.some((s) => held.has(s.entryId));
    const workerHold =
      (flagsByWorker.get(id) ?? []).length > 0
        ? `held by flag ${(flagsByWorker.get(id) ?? []).join(", ")}`
        : null;

    const isVenmo = worker.payType === "contractor_venmo";
    const rate = isVenmo ? venmoRate(worker, rules) : payRate(worker, rules);
    const hourlyPaid =
      !isVenmo &&
      (worker.payType === "hourly" || (rate.ok && rate.unit === "Hour"));

    // ── Venmo contractors: straight hours × rate (no overtime), never sent to Gusto.
    if (isVenmo) {
      say(
        id,
        `${fmtH(seconds)} h in the period (Venmo contractor, not in Gusto)`,
      );
      const reason =
        workerHold ??
        (!rate.ok ? rate.reason : allHeld ? "every entry held" : null);
      for (const r of myReimb)
        say(
          id,
          `reimbursement ${r.expenseId} (${r.amountCents ?? "unknown"}¢) is paid by Venmo outside this draft`,
        );
      if (reason || !rate.ok) {
        say(id, `not on the Venmo list: ${reason}`);
        pay[id] = { ...blank(id, "venmo", reason), excluded: true };
        continue;
      }
      const amount = centsFor(seconds, rate.rateCents);
      say(id, `rate ${rate.rateCents}¢/h from ${rate.source}`);
      say(
        id,
        `${fmtH(seconds)} h (${seconds} s) × ${rate.rateCents}¢ = ${amount}¢`,
      );
      if (seconds > 0)
        venmoList.push({
          workerId: id,
          hours: hours2(seconds),
          rateCents: rate.rateCents,
          amountCents: amount,
        });
      pay[id] = {
        workerId: id,
        kind: "venmo",
        rateCents: rate.rateCents,
        rateSource: rate.source,
        earnings: [
          {
            name: "Venmo Hours",
            seconds,
            hours: hours2(seconds),
            rateCents: rate.rateCents,
            multiplier: 1,
            amountCents: amount,
          },
        ],
        reimbursementCents: 0,
        grossCents: amount,
        excluded: false,
        reason: null,
      };
      continue;
    }

    // ── Gusto workers (hourly, salaried, commission draw).
    let reason: string | null = workerHold;
    if (!reason && !rate.ok)
      reason = `${rate.reason} (CHK-11-style hold; no default rate)`;
    if (!reason && allHeld) reason = "every entry is held";
    if (!reason && !worker.gusto?.employeeUuid) reason = "not a Gusto employee";

    const earnings: Earning[] = [];
    if (!reason && rate.ok && hourlyPaid) {
      if (rate.unit !== "Hour")
        reason = `hourly worker with a per-${rate.unit} rate`;
      else if (seconds > 0 && !ot.ok)
        reason = `${ot.reason}; overtime cannot be computed`;
      else if (seconds > 0 && ot.ok) {
        say(
          id,
          `workweek starts ${anchorSource}; overtime from rule ${ot.policy.ruleId}`,
        );
        const total: Split = {
          "Regular Hours": 0,
          Overtime: 0,
          "Double Overtime": 0,
        };
        for (const [week, days] of [...(hrs?.weeks ?? new Map())].sort()) {
          if (ot.policy.daily.length > 0 && worksSevenDays(days)) {
            reason = `worked 7 days in the workweek of ${week}; the seventh-consecutive-day premium is not modeled`;
            break;
          }
          const s = splitWeek(days, ot.policy);
          const wk = [...days.values()].reduce((a, b) => a + b, 0);
          const parts = HOURLY.filter((h) => s[h.name] > 0).map(
            (h) => `${fmtH(s[h.name])} ${h.label}`,
          );
          say(
            id,
            `week of ${week}: ${fmtH(wk)} h on ${days.size} days → ${parts.join(" + ") || "0.00 regular"}`,
          );
          if (ot.policy.daily.length > 0)
            for (const [day, sec] of [...days].sort())
              if (sec > ot.policy.daily[0].overSec) {
                const d = splitWeek(new Map([[day, sec]]), {
                  ...ot.policy,
                  weekly: null,
                });
                say(
                  id,
                  `  ${day}: ${fmtH(sec)} h → ${HOURLY.filter(
                    (h) => d[h.name] > 0,
                  )
                    .map((h) => `${fmtH(d[h.name])} ${h.label}`)
                    .join(" + ")}`,
                );
              }
          for (const h of HOURLY) total[h.name] += s[h.name];
        }
        if (!reason) {
          say(id, `rate ${rate.rateCents}¢/h from ${rate.source}`);
          for (const h of HOURLY) {
            const sec = total[h.name];
            if (sec === 0) continue;
            const amount = centsFor(sec, rate.rateCents, h.multiplier);
            const mult = h.multiplier === 1 ? "" : ` × ${h.multiplier}`;
            say(
              id,
              `${h.name} ${fmtH(sec)} h (${sec} s) × ${rate.rateCents}¢${mult} = ${amount}¢`,
            );
            earnings.push({
              name: h.name,
              seconds: sec,
              hours: hours2(sec),
              rateCents: rate.rateCents,
              multiplier: h.multiplier,
              amountCents: amount,
            });
          }
        }
      } else say(id, "no hours in the period");
    } else if (!reason && rate.ok) {
      const amount = salaryPerPeriod(
        rate.rateCents,
        rate.unit,
        opts.company.payFrequency,
      );
      if (amount === null)
        reason = `salary unit ${rate.unit} cannot be turned into a ${opts.company.payFrequency} amount`;
      else {
        say(
          id,
          `salary ${rate.rateCents}¢/${rate.unit} from ${rate.source} → ${amount}¢ per ${opts.company.payFrequency} period (Gusto pays it; no hourly line)`,
        );
        if (seconds > 0)
          say(id, `${fmtH(seconds)} h logged, for information only`);
        earnings.push({
          name: "Salary",
          seconds: null,
          hours: null,
          rateCents: rate.rateCents,
          multiplier: 1,
          amountCents: amount,
        });
      }
    }

    const excluded = reason !== null;
    const fixed: DraftLine["fixed"] = [];
    let reimbursementCents = 0;
    for (const r of myReimb) {
      if (r.amountCents === null) {
        say(id, `reimbursement ${r.expenseId} held: amount unknown`);
        continue;
      }
      if (excluded) {
        say(
          id,
          `reimbursement ${r.expenseId} (${r.amountCents}¢) withheld with the line`,
        );
        continue;
      }
      reimbursementCents += r.amountCents;
      say(
        id,
        `Reimbursement ${r.amountCents}¢ from Jobber expense ${r.expenseId} (pending reimbursement)`,
      );
    }
    if (reimbursementCents > 0)
      fixed.push({ name: "Reimbursement", amountCents: reimbursementCents });

    const grossCents = excluded
      ? 0
      : earnings.reduce((s, e) => s + e.amountCents, 0);
    if (excluded) say(id, `excluded from this draft: ${reason}`);
    else
      say(
        id,
        `gross ${grossCents}¢${reimbursementCents ? ` + reimbursement ${reimbursementCents}¢` : ""}`,
      );

    lines.push({
      workerId: id,
      excluded,
      hourly: excluded
        ? []
        : earnings
            .filter((e) => e.name !== "Salary")
            .map((e) => ({
              name: e.name as HourlyName,
              hours: e.hours as number,
            })),
      fixed: excluded ? [] : fixed,
      memo,
      heldFlagIds,
    });
    pay[id] = {
      workerId: id,
      kind: hourlyPaid ? "hourly" : "salary",
      rateCents: rate.ok ? rate.rateCents : null,
      rateSource: rate.ok ? rate.source : null,
      earnings: excluded ? [] : earnings,
      reimbursementCents: excluded ? 0 : reimbursementCents,
      grossCents,
      excluded,
      reason,
    };
  }

  const grossCents = lines.reduce((s, l) => s + pay[l.workerId].grossCents, 0);
  const hours =
    Math.round(
      lines.reduce(
        (s, l) => s + l.hourly.reduce((a, h) => a + h.hours * 100, 0),
        0,
      ),
    ) / 100;
  return {
    draft: {
      id: draftId,
      companyId: cycle.companyId,
      cycleId: cycle.id,
      stage: 1,
      lines,
      venmoList,
      workbookVersion: opts.workbookVersion ?? 1,
      gustoPayrollId: cycle.gustoPayrollId,
      status: "computed",
      totals: { grossCents, hours },
    },
    explain,
    pay,
  };
}

function blank(
  workerId: string,
  kind: WorkerPay["kind"],
  reason: string | null,
): WorkerPay {
  return {
    workerId,
    kind,
    rateCents: null,
    rateSource: null,
    earnings: [],
    reimbursementCents: 0,
    grossCents: 0,
    excluded: true,
    reason,
  };
}
