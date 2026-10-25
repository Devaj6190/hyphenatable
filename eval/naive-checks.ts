// A deliberately naive reading of the section 9 checks catalogue over the fixtures, to produce a stand-in
// flags.json for M1/M6 until B's checks engine and `eval.summary` exist. It is NOT B's checks engine and its
// numbers are not results; it exists so the scoring code is exercised on realistic flags.
import { computeStage1 } from "@payrollpilot/engine/payroll/stage1";
import { computeStage2 } from "@payrollpilot/engine/payroll/stage2";
import type { Rule, TimeEntry } from "@payrollpilot/engine/payroll/types";
import type { Fixtures } from "./lib/io";
import type { FlagLike, Subject } from "./lib/types";

const ROUTE: Record<string, FlagLike["routeTo"]> = {
  "CHK-06": "owner",
  "CHK-08": "owner",
  "CHK-09": "owner",
  "CHK-10": "owner",
  "CHK-11": "owner",
  "CHK-12": "none",
  "CHK-15": "owner",
  "CHK-17": "owner",
  "CHK-18": "owner",
  "CHK-19": "owner",
  "CHK-20": "owner",
  "CHK-21": "owner",
  "CHK-22": "owner",
  "CHK-23": "owner",
};

/** The fixture rules are `proposed`; the naive checker treats them as approved. */
const activate = (rules: Rule[]): Rule[] =>
  rules.map((r) => ({ ...r, status: "active" }));

export function naiveFlags(fx: Fixtures, cycleId: string): FlagLike[] {
  const cycle = fx.cycles.find((c) => c.id === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId}`);
  const rules = activate(fx.rules);
  const t0 = Date.parse(cycle.periodStart);
  const t1 = Date.parse(cycle.periodEnd);
  const inPeriod = (iso: string | null) =>
    iso !== null && Date.parse(iso) >= t0 && Date.parse(iso) <= t1;
  const day = (iso: string) => iso.slice(0, 10);
  const E = fx.entries.filter((e) => e.cycleId === cycleId);
  const X = fx.expenses.filter(
    (x) =>
      x.date.slice(0, 10) >= day(cycle.periodStart) &&
      x.date.slice(0, 10) <= day(cycle.periodEnd),
  );
  const out: FlagLike[] = [];
  const add = (
    checkId: string,
    s: Partial<Subject>,
    seen: string,
    where: { system: string; recordId: string }[],
    confidence: FlagLike["confidence"] = "certain",
  ) =>
    out.push({
      id: `naive-${cycleId}-${String(out.length + 1).padStart(3, "0")}`,
      companyId: fx.company.id,
      cycleId,
      checkId,
      status: "open",
      subject: {
        workerId: null,
        jobId: null,
        entryIds: [],
        expenseIds: [],
        ...s,
      },
      seen,
      where: where.map((w) => ({ ...w, url: null })),
      confidence,
      precedent: { ruleId: null, flagId: null, note: "no precedent" },
      routeTo: ROUTE[checkId] ?? "manager",
      affects: {
        workerId: s.workerId ?? null,
        jobId: s.jobId ?? null,
        dollarsCents: null,
      },
      questionId: null,
      correctionId: null,
    });
  const te = (e: TimeEntry) => ({ system: "jobber", recordId: e.sourceId });

  // CHK-01..06: entries
  for (const e of E) {
    if (
      !e.jobId &&
      !e.visitId &&
      !["BREAK", "OFFICE", "DRIVING"].includes(e.category ?? "")
    )
      add(
        "CHK-01",
        { workerId: e.workerId, entryIds: [e.id] },
        `${e.id} has no job and no visit`,
        [te(e)],
      );
    if (e.ticking)
      add(
        "CHK-02",
        { workerId: e.workerId, jobId: e.jobId, entryIds: [e.id] },
        `${e.id} is still ticking`,
        [te(e)],
      );
    const longH =
      (rules.find((r) => r.type === "long_shift_threshold")?.params
        .hours as number) ?? fx.company.settings.longShiftHours;
    if (e.durationSec > longH * 3600)
      add(
        "CHK-03",
        { workerId: e.workerId, jobId: e.jobId, entryIds: [e.id] },
        `${e.id} is longer than ${longH} h`,
        [te(e)],
      );
    if (e.durationSec === 0 && !e.ticking)
      add(
        "CHK-05",
        { workerId: e.workerId, entryIds: [e.id] },
        `${e.id} has zero duration`,
        [te(e)],
      );
    if (!e.approved)
      add(
        "CHK-06",
        { workerId: e.workerId, entryIds: [e.id] },
        `${e.id} not approved at cutoff`,
        [te(e)],
      );
  }
  const dupKey = (e: TimeEntry) =>
    `${e.workerId}|${e.jobId}|${e.startAt}|${e.durationSec}`;
  const groups = new Map<string, TimeEntry[]>();
  for (const e of E)
    groups.set(dupKey(e), [...(groups.get(dupKey(e)) ?? []), e]);
  for (const g of groups.values())
    if (g.length > 1)
      add(
        "CHK-05",
        { workerId: g[0].workerId, entryIds: g.map((e) => e.id) },
        `${g.map((e) => e.id).join(", ")} are duplicates`,
        g.map(te),
      );
  const end = (e: TimeEntry) => Date.parse(e.startAt) + e.durationSec * 1000;
  for (const a of E)
    for (const b of E)
      if (
        a.id < b.id &&
        a.workerId === b.workerId &&
        dupKey(a) !== dupKey(b) &&
        Math.min(end(a), end(b)) -
          Math.max(Date.parse(a.startAt), Date.parse(b.startAt)) >
          60_000
      )
        add(
          "CHK-04",
          { workerId: a.workerId, entryIds: [a.id, b.id] },
          `${a.id} and ${b.id} overlap`,
          [te(a), te(b)],
        );

  // CHK-07..12: workers
  const hasHours = new Set(E.map((e) => e.workerId));
  for (const w of fx.workers) {
    const mine = E.filter((e) => e.workerId === w.id);
    const gw = { system: "gusto", recordId: w.gusto?.employeeUuid ?? w.id };
    if (w.status === "active" && w.payType === "hourly" && mine.length === 0)
      add(
        "CHK-07",
        { workerId: w.id },
        `${w.id} is active hourly with no entries`,
        [gw],
      );
    if (w.status === "inactive" && mine.length)
      add(
        "CHK-08",
        { workerId: w.id, entryIds: mine.map((e) => e.id) },
        `${w.id} is inactive with entries`,
        mine.map(te),
      );
    else if (w.status === "inactive" && w.gusto?.employeeUuid)
      add(
        "CHK-08",
        { workerId: w.id },
        `${w.id} is inactive in Jobber but still in Gusto`,
        [gw],
      );
    if (w.gusto?.onboarded === false && hasHours.has(w.id))
      add("CHK-09", { workerId: w.id }, `${w.id} not onboarded in Gusto`, [gw]);
    const jr = w.jobber?.labourRateCents;
    const gr = w.gusto?.rateCents;
    if (w.payType === "hourly" && jr != null && gr != null && jr !== gr)
      add(
        "CHK-10",
        { workerId: w.id },
        `${w.id} Jobber rate ${jr} vs Gusto ${gr}`,
        [gw],
      );
    if (w.payType === "contractor_venmo" && w.venmoRateCents === null)
      add(
        "CHK-11",
        { workerId: w.id },
        `${w.id} is paid by Venmo with no rate`,
        [{ system: "jobber", recordId: w.jobber?.userId ?? w.id }],
      );
    if (w.payType !== "hourly" && hasHours.has(w.id))
      add(
        "CHK-12",
        { workerId: w.id },
        `${w.id} (${w.payType}) has hours outside the Jobber-Gusto sync`,
        [gw],
      );
  }

  // CHK-13: completed visit in the period, no entries on its job
  for (const v of fx.visits)
    if (
      v.isComplete &&
      inPeriod(v.startAt) &&
      !E.some((e) => e.jobId === v.jobId)
    )
      add(
        "CHK-13",
        { jobId: v.jobId },
        `${v.jobId} has a completed visit ${v.id} and no entries`,
        [{ system: "jobber", recordId: v.id }],
      );

  // CHK-14..17: expenses
  const xw = (id: string) => ({
    system: X.find((x) => x.id === id)?.source ?? "qbo",
    recordId: id,
  });
  for (const x of X)
    if (x.kind === "job_cost" && !x.matchedJobId)
      add(
        "CHK-14",
        { expenseIds: [x.id] },
        `${x.id} job cost with no job`,
        [xw(x.id)],
        0.8,
      );
  for (const a of X)
    for (const b of X)
      if (
        a.id < b.id &&
        a.amountCents !== null &&
        b.amountCents !== null &&
        Math.abs(a.amountCents - b.amountCents) <= 1 &&
        Math.abs(Date.parse(day(a.date)) - Date.parse(day(b.date))) <=
          86_400_000 &&
        (a.vendor === b.vendor || a.source !== b.source)
      )
        add(
          "CHK-15",
          { jobId: a.matchedJobId ?? b.matchedJobId, expenseIds: [a.id, b.id] },
          `${a.id} and ${b.id} look like one purchase`,
          [xw(a.id), xw(b.id)],
          0.9,
        );
  for (const link of rules.filter((r) => r.type === "disposal_parent_link")) {
    const prefix = link.params.titlePrefix as string;
    for (const j of fx.jobs)
      if (
        j.title.startsWith(prefix) &&
        !j.parentJobId &&
        (inPeriod(j.startAt) || E.some((e) => e.jobId === j.id))
      )
        add(
          "CHK-16",
          {
            jobId: j.id,
            expenseIds: X.filter((x) => x.matchedJobId === j.id).map(
              (x) => x.id,
            ),
          },
          `${j.id} looks like a disposal sub-job with no parent`,
          [{ system: "jobber", recordId: j.sourceId }],
        );
  }
  const kinds = new Set(
    rules
      .filter((r) => r.type === "expense_account_kind")
      .map((r) => r.params.accountName),
  );
  for (const x of X)
    if (x.accountName && !kinds.has(x.accountName))
      add(
        "CHK-17",
        { expenseIds: [x.id] },
        `${x.id} account ${x.accountName} has no kind rule`,
        [xw(x.id)],
      );

  // CHK-18, 19, 21 from the Stage 2 reconciliation
  const s2 = computeStage2({
    cycle,
    company: {
      id: fx.company.id,
      timezone: fx.company.timezone,
      lowMarginPct: fx.company.settings.lowMarginPct ?? 20,
    },
    jobs: fx.jobs,
    quotes: fx.quotes,
    invoices: fx.invoices,
    payments: fx.payments,
    expenses: fx.expenses,
    entries: E,
    workers: fx.workers,
    rules,
  });
  for (const s of s2.report.recon.staleRates)
    add(
      "CHK-18",
      { workerId: s.workerId },
      `${s.workerId} costed at ${s.jobberRateCents} vs rule ${s.ruleRateCents}`,
      [{ system: "jobber", recordId: s.workerId }],
    );
  for (const j of s2.report.recon.jobs)
    if (j.misclassifiedPaymentIds.length)
      add(
        "CHK-19",
        { jobId: j.jobId },
        `${j.misclassifiedPaymentIds.join(", ")} on ${j.jobId} counted as the wrong kind`,
        j.misclassifiedPaymentIds.map((p) => ({
          system: "jobber",
          recordId: p,
        })),
      );
  for (const p of s2.report.profits)
    if (p.low)
      add("CHK-21", { jobId: p.jobId }, `${p.jobId} margin ${p.marginPct}%`, [
        { system: "jobber", recordId: p.jobId },
      ]);

  // CHK-20: quotes on in-person jobs by someone else
  for (const q of rules.filter((r) => r.type === "in_person_quoter"))
    for (const quote of fx.quotes) {
      const job = fx.jobs.find((j) => j.id === quote.jobId);
      if (
        job?.title
          .toLowerCase()
          .includes(String(q.params.titleKeyword).toLowerCase()) &&
        quote.salespersonWorkerId !== q.params.workerId &&
        inPeriod(quote.sentAt)
      )
        add(
          "CHK-20",
          { workerId: quote.salespersonWorkerId, jobId: job.id },
          `${quote.id} by ${quote.salespersonWorkerId}, rule says ${q.params.workerId}`,
          [{ system: "jobber", recordId: quote.sourceId }],
          0.9,
        );
    }

  // CHK-22: Stage 1 gross vs the mean of the last 3 cycles (regular + Venmo rows)
  const s1 = computeStage1(cycle, E, fx.workers, rules, {
    company: fx.company,
  });
  const past = fx.cycles
    .filter((c) => c.number < cycle.number)
    .sort((a, b) => b.number - a.number)
    .slice(0, 3)
    .map((c) => c.id);
  for (const w of fx.workers) {
    const rows = fx.pastPayrolls.filter(
      (p) =>
        p.workerId === w.id &&
        past.includes(p.cycleId) &&
        p.paidVia !== "gusto_off_cycle",
    );
    // A cycle with no row was paid 0; a worker not paid this cycle (no line, or excluded) counts as 0.
    if (rows.length === 0) continue;
    const gross =
      s1.pay[w.id] && !s1.pay[w.id].excluded ? s1.pay[w.id].grossCents : 0;
    const mean = rows.reduce((s, r) => s + r.grossCents, 0) / past.length;
    if (
      mean > 0 &&
      (Math.abs(gross - mean) / mean) * 100 > fx.company.settings.grossChangePct
    )
      add(
        "CHK-22",
        { workerId: w.id },
        `${w.id} gross ${gross} vs 3-cycle mean ${Math.round(mean)}`,
        [{ system: "gusto", recordId: w.gusto?.employeeUuid ?? w.id }],
      );
  }

  // CHK-23: incomplete sync runs (no subject ids)
  for (const r of fx.syncRuns.filter((s) => !s.complete))
    add(
      "CHK-23",
      {},
      `${r.id} ${r.source} ${r.object} pulled ${r.pulled} of ${r.expected}`,
      [{ system: r.source, recordId: r.id }],
    );
  return out;
}
