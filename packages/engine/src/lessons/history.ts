// B-13: onboarding from past cycles. Code summarizes the history first (the Analyst reads summaries,
// ids only, never raw rows), and proposes the rules arithmetic can settle on its own, each with
// evidence ids. Rules that need judgment (commission, tips, manager split, disposal links, who quoted
// in person) are the Analyst's. Every proposal is backtested and approved by the owner before use.
import type { RuleType } from "../schemas";
import { backtest, type PastCycle } from "./lessons";

export type PaidRow = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: string;
  earnings: {
    name: string;
    hours: number | null;
    rateCents?: number | null;
    amountCents: number;
  }[];
  grossCents: number;
};

export type HistoryInput = {
  companyId: string;
  /** Past cycle ids, oldest first (the current cycle is left out). */
  cycleIds: string[];
  paid: PaidRow[];
  expenses: {
    id: string;
    date: string;
    accountName: string | null;
    matchedJobId: string | null;
  }[];
  payments: {
    id: string;
    quoteId: string | null;
    invoiceId: string | null;
    kind: string;
  }[];
  answered: {
    id: string;
    cycleId: string;
    toWorkerId: string;
    toRole: string;
  }[];
  /** Stage 1 inputs per past cycle, for backtesting pay proposals. */
  pastCycles: PastCycle[];
};

export type Proposal = {
  type: RuleType;
  params: Record<string, string | number | boolean | null>;
  statement: string;
  evidence: string[];
  seenInCycles: number;
  ofCycles: number;
  confidence: number;
};

const unique = <T>(xs: T[]) => [...new Set(xs)];

/**
 * Gusto's API says "Regular Hours"; its payroll exports say "Regular". Same earning, any case or spacing.
 * The bare "Hours" stays as is: the contract keeps it for Venmo rows.
 */
const EARNING = new Map([
  ["regular", "Regular Hours"],
  ["regular hours", "Regular Hours"],
  ["overtime", "Overtime"],
  ["overtime hours", "Overtime"],
  ["double overtime", "Double Overtime"],
  ["double overtime hours", "Double Overtime"],
]);
export const earningName = (name: string) =>
  EARNING.get(name.trim().replace(/\s+/g, " ").toLowerCase()) ?? name;

/** Paid rate per worker for one earning name, with the rows that show it. */
function paidRates(paid: PaidRow[], name: string) {
  const out = new Map<string, { rates: Set<number>; rows: PaidRow[] }>();
  for (const row of paid)
    for (const e of row.earnings) {
      if (earningName(e.name) !== name || !e.hours || !e.rateCents) continue;
      const cur = out.get(row.workerId) ?? { rates: new Set(), rows: [] };
      cur.rates.add(e.rateCents);
      cur.rows.push(row);
      out.set(row.workerId, cur);
    }
  return out;
}

/** What the Analyst reads: summaries with ids, never names or raw rows. */
export function summarize(h: HistoryInput) {
  const regular = paidRates(h.paid, "Regular Hours");
  const venmo = paidRates(
    h.paid.filter((p) => p.paidVia === "venmo"),
    "Hours",
  );
  const accounts = new Map<
    string,
    { count: number; withJob: number; ids: string[] }
  >();
  for (const x of h.expenses) {
    const k = x.accountName ?? "(none)";
    const a = accounts.get(k) ?? { count: 0, withJob: 0, ids: [] };
    a.count++;
    if (x.matchedJobId) a.withJob++;
    if (a.ids.length < 5) a.ids.push(x.id);
    accounts.set(k, a);
  }
  return {
    cycles: h.cycleIds,
    paidRegularRates: [...regular].map(([workerId, r]) => ({
      workerId,
      rateCents: [...r.rates],
      cycles: unique(r.rows.map((x) => x.cycleId)).length,
    })),
    overtimePaid: h.paid.flatMap((p) =>
      p.earnings
        .filter((e) => earningName(e.name) === "Overtime")
        .map((e) => ({
          payrollId: p.id,
          cycleId: p.cycleId,
          workerId: p.workerId,
          hours: e.hours,
          rateCents: e.rateCents ?? null,
        })),
    ),
    venmo: [...venmo].map(([workerId, r]) => ({
      workerId,
      rateCents: [...r.rates],
      rows: r.rows.map((x) => x.id),
    })),
    offCycle: h.paid
      .filter((p) => p.paidVia === "gusto_off_cycle")
      .map((p) => ({
        payrollId: p.id,
        cycleId: p.cycleId,
        workerId: p.workerId,
        earnings: p.earnings.map((e) => e.name),
      })),
    expenseAccounts: [...accounts].map(([accountName, a]) => ({
      accountName,
      ...a,
    })),
    payments: {
      onQuotes: h.payments
        .filter((p) => p.quoteId && !p.invoiceId)
        .map((p) => ({ id: p.id, kind: p.kind })),
      onInvoices: h.payments
        .filter((p) => p.invoiceId && !p.quoteId)
        .map((p) => ({ id: p.id, kind: p.kind })),
    },
    answeredBy: h.answered.map((q) => ({
      questionId: q.id,
      cycleId: q.cycleId,
      workerId: q.toWorkerId,
      role: q.toRole,
    })),
  };
}

export type HistorySummary = ReturnType<typeof summarize>;

/**
 * The rules arithmetic settles: constant paid rates, the overtime multiplier (backtested at 40 h a
 * week), Venmo rates, expense accounts that are always or never job cost, how quote and invoice
 * payments are treated, and who answers job facts vs money questions. Anything mixed is left out.
 */
export function proposeFromHistory(h: HistoryInput): Proposal[] {
  const of = Math.max(1, h.cycleIds.length);
  const out: Proposal[] = [];
  const cyclesOf = (rows: { cycleId: string }[]) =>
    unique(rows.map((r) => r.cycleId)).length;

  for (const [workerId, r] of paidRates(h.paid, "Regular Hours")) {
    if (r.rates.size !== 1) continue;
    const rateCents = [...r.rates][0];
    out.push({
      type: "pay_rate",
      params: {
        workerId,
        rateCents,
        paymentUnit: "Hour",
        costRateCentsPerHour: rateCents,
      },
      statement: `${workerId} is paid ${rateCents}¢ an hour in every past cycle.`,
      evidence: r.rows.map((x) => x.id),
      seenInCycles: cyclesOf(r.rows),
      ofCycles: of,
      confidence: 1,
    });
  }

  const ratios = h.paid.flatMap((p) => {
    const reg = p.earnings.find(
      (e) => earningName(e.name) === "Regular Hours",
    )?.rateCents;
    const ot = p.earnings.find(
      (e) => earningName(e.name) === "Overtime",
    )?.rateCents;
    return reg && ot
      ? [{ row: p, ratio: Math.round((ot / reg) * 100) / 100 }]
      : [];
  });
  const ratioSet = unique(ratios.map((x) => x.ratio));
  if (ratioSet.length === 1) {
    const candidate = {
      type: "overtime_policy" as const,
      params: { weeklyHours: 40, multiplier: ratioSet[0], dailyHours: null },
    };
    const bt = backtest(
      { id: "candidate", companyId: h.companyId, ...candidate },
      h.pastCycles,
    );
    if (bt && bt.disagree === 0)
      out.push({
        ...candidate,
        statement: `Overtime is paid at ${ratioSet[0]}x after 40 hours in a week.`,
        evidence: ratios.map((x) => x.row.id),
        seenInCycles: cyclesOf(ratios.map((x) => x.row)),
        ofCycles: of,
        confidence: 1,
      });
  }

  for (const [workerId, r] of paidRates(
    h.paid.filter((p) => p.paidVia === "venmo"),
    "Hours",
  )) {
    if (r.rates.size !== 1) continue;
    const rateCents = [...r.rates][0];
    out.push({
      type: "venmo_rate",
      params: { workerId, rateCents },
      statement: `${workerId} is paid by Venmo at ${rateCents}¢ an hour.`,
      evidence: r.rows.map((x) => x.id),
      seenInCycles: cyclesOf(r.rows),
      ofCycles: of,
      confidence: 1,
    });
  }

  const byAccount = new Map<string, HistoryInput["expenses"]>();
  for (const x of h.expenses)
    if (x.accountName)
      byAccount.set(x.accountName, [
        ...(byAccount.get(x.accountName) ?? []),
        x,
      ]);
  for (const [accountName, xs] of byAccount) {
    const share = xs.filter((x) => x.matchedJobId).length / xs.length;
    // 90%: one unmatched purchase among many tagged ones is an error to ask about, not a mixed account.
    const kind =
      xs.length >= 3 && share >= 0.9
        ? "job_cost"
        : xs.length >= 2 && share === 0
          ? "overhead"
          : null;
    if (!kind) continue;
    out.push({
      type: "expense_account_kind",
      params: { accountName, kind },
      statement: `${accountName} purchases are ${kind === "job_cost" ? "job costs" : "overhead"} (${Math.round(share * 100)}% tagged to a job).`,
      evidence: xs.slice(0, 10).map((x) => x.id),
      seenInCycles: of,
      ofCycles: of,
      confidence: kind === "overhead" || share === 1 ? 1 : 0.9,
    });
  }

  const onQuotes = h.payments.filter((p) => p.quoteId && !p.invoiceId);
  const onInvoices = h.payments.filter((p) => p.invoiceId && !p.quoteId);
  if (
    onQuotes.length &&
    onInvoices.length &&
    onQuotes.every((p) => p.kind === "deposit") &&
    onInvoices.every((p) => p.kind === "final" || p.kind === "unknown")
  ) {
    const known = onInvoices.filter((p) => p.kind === "final");
    if (known.length >= onInvoices.length - 1)
      out.push({
        type: "deposit_vs_final",
        params: { quotePayment: "deposit", invoicePayment: "final" },
        statement:
          "A payment on a quote is a deposit; a payment on an invoice is the final payment.",
        evidence: [...onQuotes.slice(0, 5), ...known.slice(0, 5)].map(
          (p) => p.id,
        ),
        seenInCycles: of,
        ofCycles: of,
        confidence: 1,
      });
  }

  const managers = unique(
    h.answered.filter((q) => q.toRole === "manager").map((q) => q.toWorkerId),
  );
  const owners = unique(
    h.answered.filter((q) => q.toRole === "owner").map((q) => q.toWorkerId),
  );
  if (managers.length === 1 && owners.length <= 1)
    out.push({
      type: "routing",
      params: { jobFacts: managers[0], money: owners[0] ?? null },
      statement: `${managers[0]} answers job facts${owners[0] ? `; ${owners[0]} answers money questions` : ""}.`,
      evidence: h.answered.map((q) => q.id),
      seenInCycles: cyclesOf(h.answered),
      ofCycles: of,
      confidence: 1,
    });

  return out;
}
