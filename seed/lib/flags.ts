// Expected flags derived from the answer key (one Flag per answer-key row, plus the documented expected
// extras such as CHK-23). These are NOT output of B's checks engine: they are what a correct engine should
// raise, in the shared-context section 6 Flag shape, so the dashboard can be built before the engine runs.
// `where` uses our own record ids (fixtures stay id-stable), never upstream ids.

type Rec = Record<string, unknown>;

/** Section 9 routing. */
export const ROUTE: Record<string, "owner" | "manager" | "none"> = {
  "CHK-01": "manager",
  "CHK-02": "manager",
  "CHK-03": "manager",
  "CHK-04": "manager",
  "CHK-05": "manager",
  "CHK-06": "owner",
  "CHK-07": "manager",
  "CHK-08": "owner",
  "CHK-09": "owner",
  "CHK-10": "owner",
  "CHK-11": "owner",
  "CHK-12": "none",
  "CHK-13": "manager",
  "CHK-14": "manager",
  "CHK-15": "owner",
  "CHK-16": "manager",
  "CHK-17": "owner",
  "CHK-18": "owner",
  "CHK-19": "owner",
  "CHK-20": "owner",
  "CHK-21": "owner",
  "CHK-22": "owner",
  "CHK-23": "owner",
};

/** Fuzzy checks carry a score instead of "certain" (section 9: matching score; 0.9 for doubles; rule-based else ask). */
export const FUZZY_CONFIDENCE: Record<string, number> = {
  "CHK-14": 0.6,
  "CHK-15": 0.9,
  "CHK-20": 0.75,
};

export type FlagInputs = {
  companyId: string;
  cycleId: string;
  idPrefix: string; // e.g. "a-fl-" -> a-fl-01, or "a-fl-6" -> a-fl-601
  settings: Rec;
  entries: Rec[];
  expenses: Rec[];
  jobs: Rec[];
  workers: Rec[];
  rules: Rec[];
  payments: Rec[];
  invoices: Rec[];
  quotes: Rec[];
  syncRuns: Rec[];
  lowMarginPct: number;
  /** Flags of an earlier cycle: a row of the same check on the same worker/job/kind becomes the precedent. */
  priorFlags?: Rec[];
  priorCutoffDate?: string;
};

const cents = (c: number) => `$${(c / 100).toFixed(2)}`;

export function flagsFromAnswerKey(
  rows: Rec[],
  x: FlagInputs,
  extras: Rec[] = [],
): Rec[] {
  const byId = <T extends Rec>(list: T[], id: unknown) =>
    list.find((r) => r.id === id);
  const all = [...rows, ...extras];
  return all.map((row, i) => {
    const checkId = row.checkId as string;
    const s = row.subject as {
      workerId: string | null;
      jobId: string | null;
      entryIds: string[];
      expenseIds: string[];
    };
    const w = s.workerId;
    const worker = w ? byId(x.workers, w) : undefined;
    const ent = s.entryIds
      .map((id) => byId(x.entries, id))
      .filter(Boolean) as Rec[];
    const exp = s.expenseIds
      .map((id) => byId(x.expenses, id))
      .filter(Boolean) as Rec[];
    const e0 = s.entryIds[0];
    const hours = (e: Rec | undefined) =>
      e ? Math.round(((e.durationSec as number) / 3600) * 100) / 100 : null;
    const where: { system: string; recordId: string; url: null }[] = [];
    for (const id of s.entryIds)
      where.push({ system: "jobber", recordId: id, url: null });
    for (const e of exp)
      where.push({
        system: String(e.source),
        recordId: e.id as string,
        url: null,
      });
    if (s.jobId) where.push({ system: "jobber", recordId: s.jobId, url: null });

    let seen = "";
    let dollars: number | null = null;
    let precedent: Rec | null = null;
    const ruleNote = (type: string, pick?: (r: Rec) => boolean) => {
      const r = x.rules.find((q) => q.type === type && (!pick || pick(q)));
      return r
        ? {
            ruleId: r.id as string,
            flagId: null,
            note: `rule: ${type} ${JSON.stringify(r.params)}`,
          }
        : null;
    };
    const payRule = (wid: string | null) =>
      ruleNote("pay_rate", (r) => (r.params as Rec).workerId === wid);
    switch (checkId) {
      case "CHK-01":
        seen = `Entry ${e0} for ${w} (${hours(ent[0])} h) has no job and no visit.`;
        break;
      case "CHK-02":
        seen = `Entry ${e0} for ${w} was still running at cutoff.`;
        break;
      case "CHK-03":
        seen = `Entry ${e0} for ${w} is ${hours(ent[0])} h, over the ${x.settings.longShiftHours} h long-shift threshold.`;
        precedent = ruleNote("long_shift_threshold");
        break;
      case "CHK-04":
        seen = `Entries ${s.entryIds.join(" and ")} for ${w} overlap.`;
        break;
      case "CHK-05":
        seen =
          s.entryIds.length > 1
            ? `Entries ${s.entryIds.join(" and ")} for ${w} are exact duplicates.`
            : `Entry ${e0} for ${w} has zero duration.`;
        break;
      case "CHK-06":
        seen = `Entry ${e0} for ${w} was not approved at cutoff.`;
        break;
      case "CHK-07":
        seen = `Active hourly worker ${w} has no time entries this cycle.`;
        where.push({ system: "jobber", recordId: w as string, url: null });
        break;
      case "CHK-08":
        seen = ent.length
          ? `Inactive worker ${w} has ${ent.length} time entries this cycle.`
          : `Worker ${w} is inactive in Jobber but still active in Gusto.`;
        where.push(
          { system: "jobber", recordId: w as string, url: null },
          { system: "gusto", recordId: w as string, url: null },
        );
        break;
      case "CHK-09":
        seen = `Worker ${w} has hours but has not finished Gusto onboarding.`;
        where.push({ system: "gusto", recordId: w as string, url: null });
        break;
      case "CHK-10": {
        const jr = (worker?.jobber as Rec | null)?.labourRateCents as
          | number
          | null;
        const gr = (worker?.gusto as Rec | null)?.rateCents as number | null;
        seen = `Worker ${w} has a Jobber labour rate of ${jr == null ? "none" : `${cents(jr)}/h`} and a Gusto rate of ${gr == null ? "none" : `${cents(gr)}/h`}.`;
        where.push(
          { system: "jobber", recordId: w as string, url: null },
          { system: "gusto", recordId: w as string, url: null },
        );
        precedent = payRule(w);
        break;
      }
      case "CHK-11":
        seen = `Venmo contractor ${w} has hours but no rate on file.`;
        where.push({
          system: "payrollpilot",
          recordId: w as string,
          url: null,
        });
        break;
      case "CHK-12":
        seen = `Worker ${w} (${worker?.payType}) has hours; paid outside the Jobber-to-Gusto sync.`;
        where.push({ system: "jobber", recordId: w as string, url: null });
        break;
      case "CHK-13":
        seen = `Job ${s.jobId} has a completed visit but no time entries.`;
        break;
      case "CHK-14":
        seen = `Job-cost expense ${exp[0]?.id} (${cents(exp[0]?.amountCents as number)}) has no job.`;
        dollars = exp[0]?.amountCents as number;
        break;
      case "CHK-15":
        seen = `Expenses ${s.expenseIds.join(" and ")} look like the same ${cents(exp[0]?.amountCents as number)} purchase.`;
        dollars = exp[0]?.amountCents as number;
        break;
      case "CHK-16":
        seen = `Job ${s.jobId} is a disposal run with no parent job.`;
        dollars =
          exp.reduce((t, e) => t + (e.amountCents as number), 0) || null;
        precedent = ruleNote("disposal_parent_link");
        break;
      case "CHK-17":
        seen = `Expense ${exp[0]?.id} is on account ${exp[0]?.accountName}, which has no job-cost/overhead rule.`;
        dollars = exp[0]?.amountCents as number;
        break;
      case "CHK-18":
        seen = `Labour for ${w} is costed at a Jobber rate that differs from the current pay rate.`;
        where.push({ system: "jobber", recordId: w as string, url: null });
        precedent = payRule(w);
        break;
      case "CHK-19": {
        const inv = x.invoices.find((v) => v.jobId === s.jobId);
        const pay = x.payments.find(
          (p) => p.invoiceId === inv?.id && p.quoteId && p.kind === "final",
        );
        seen = `Payment ${pay?.id} on job ${s.jobId} is a quote deposit recorded as invoice ${inv?.id}'s final payment.`;
        if (pay)
          where.push({
            system: "jobber",
            recordId: pay.id as string,
            url: null,
          });
        if (inv)
          where.push({
            system: "jobber",
            recordId: inv.id as string,
            url: null,
          });
        dollars =
          inv && pay
            ? (inv.totalCents as number) - (pay.amountCents as number)
            : null;
        precedent = ruleNote("deposit_vs_final");
        break;
      }
      case "CHK-20": {
        const q = x.quotes.find((v) => v.jobId === s.jobId);
        seen = `Quote ${q?.id} on job ${s.jobId} lists ${q?.salespersonWorkerId} as salesperson; the in-person quoter rule names another worker.`;
        if (q)
          where.push({ system: "jobber", recordId: q.id as string, url: null });
        precedent = ruleNote("in_person_quoter");
        break;
      }
      case "CHK-21":
        seen = `Job ${s.jobId}'s margin is below the ${x.lowMarginPct}% threshold.`;
        break;
      case "CHK-22":
        seen = `Worker ${w}'s gross differs by more than ${x.settings.grossChangePct}% from the mean of the last 3 cycles.`;
        where.push({ system: "gusto", recordId: w as string, url: null });
        break;
      case "CHK-23": {
        const sr = byId(x.syncRuns, row.syncRunId);
        seen = `Sync run ${sr?.id} pulled ${sr?.pulled} of ${sr?.expected} ${sr?.object} from ${sr?.source}.`;
        where.push({
          system: String(sr?.source),
          recordId: String(sr?.id),
          url: null,
        });
        break;
      }
      default:
        throw new Error(`no flag template for ${checkId}`);
    }
    // a matching flag in the previous cycle is the precedent (cycle 2), unless a rule already is
    if (!precedent && x.priorFlags) {
      const prior = x.priorFlags.find(
        (f) =>
          f.checkId === checkId &&
          JSON.stringify((f.subject as Rec).workerId) === JSON.stringify(w),
      );
      if (prior)
        precedent = {
          ruleId: null,
          flagId: prior.id as string,
          note: `same as flag ${prior.id} on ${x.priorCutoffDate}`,
        };
    }
    return {
      id: `${x.idPrefix}${String(i + 1).padStart(2, "0")}`,
      companyId: x.companyId,
      cycleId: (row.cycleId as string | undefined) ?? x.cycleId,
      checkId,
      status: "open",
      subject: {
        workerId: s.workerId,
        jobId: s.jobId,
        entryIds: s.entryIds,
        expenseIds: s.expenseIds,
      },
      seen,
      where,
      confidence: FUZZY_CONFIDENCE[checkId] ?? "certain",
      precedent: precedent ?? {
        ruleId: null,
        flagId: null,
        note: "no precedent",
      },
      routeTo: ROUTE[checkId],
      affects: { workerId: s.workerId, jobId: s.jobId, dollarsCents: dollars },
      questionId: null,
      correctionId: null,
    };
  });
}
