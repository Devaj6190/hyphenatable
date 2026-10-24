// A-13 steps 3-4: commissions, tips and the manager split, each from its active rule. Money is summed
// unrounded per payee and rounded half-up once. No rule, or anything unknown → held with a reason.
import { divHalfUp } from "./money";
import type { JobProfit } from "./profit";
import type { JobRecon } from "./reconcile";
import type { Job, Quote, Rule, TimeEntry, Worker } from "./types";

export type Payout = {
  workerId: string;
  name: "Commission" | "Paycheck Tips" | "Cash Tips" | "Bonus";
  amountCents: number;
  explain: string[];
};
export type Held = { workerId: string | null; what: string; reason: string };
export type Payouts = { payouts: Payout[]; held: Held[]; notes: string[] };

const active = (rules: Rule[], type: Rule["type"]) =>
  rules.filter((r) => r.type === type && r.status === "active");
const hundredths = (pct: unknown) =>
  typeof pct === "number" && pct > 0 ? Math.round(pct * 100) : null;

export function commissions(
  rules: Rule[],
  jobs: Job[],
  quotes: Quote[],
  profits: Map<string, JobProfit>,
  workers: Worker[],
  /** Jobs not complete: profit-based commission on them is held (precision over recall). */
  incomplete: Set<string> = new Set(),
): Payouts {
  const out: Payouts = { payouts: [], held: [], notes: [] };
  const plans = active(rules, "commission_plan");
  if (plans.length !== 1) {
    out.notes.push(
      plans.length
        ? `conflicting commission_plan rules ${plans.map((r) => r.id).join(", ")}; no commission`
        : "no active commission_plan rule; no commission line (ask the owner)",
    );
    if (plans.length)
      out.held.push({
        workerId: null,
        what: "commission",
        reason: out.notes[0],
      });
    return out;
  }
  const plan = plans[0];
  const p = plan.params;
  const onTotal = hundredths(p.pctOfJobTotal);
  const onProfit = hundredths(p.pctOfJobProfit);
  const pctH = onTotal ?? onProfit;
  if (pctH === null || (onTotal && onProfit)) {
    out.held.push({
      workerId: null,
      what: "commission",
      reason: `${plan.id}: unreadable percentage`,
    });
    return out;
  }
  const quoters = active(rules, "in_person_quoter");
  const known = new Set(workers.map((w) => w.id));
  const sums = new Map<string, { num: number; lines: string[] }>();
  for (const job of jobs) {
    const quote = quotes.find((q) => q.id === job.quoteId) ?? null;
    const payee = quote?.salespersonWorkerId ?? job.salespersonWorkerId;
    let eligible = false;
    if (p.when === "quote_in_person") {
      const q = quoters.find(
        (r) =>
          typeof r.params.titleKeyword === "string" &&
          job.title
            .toLowerCase()
            .includes((r.params.titleKeyword as string).toLowerCase()),
      );
      if (!q) continue;
      eligible = true;
      if (payee !== q.params.workerId) {
        out.held.push({
          workerId: (q.params.workerId as string) ?? null,
          what: `commission on ${job.id}`,
          reason: `quote salesperson ${payee ?? "none"} differs from in_person_quoter rule ${q.id} (${q.params.workerId}) (CHK-20)`,
        });
        continue;
      }
    } else if (p.jobKind === "install")
      eligible = job.quoteId !== null && payee !== null;
    else {
      out.held.push({
        workerId: null,
        what: "commission",
        reason: `${plan.id}: unsupported plan`,
      });
      return out;
    }
    if (!eligible || !payee) continue;
    if (!known.has(payee)) {
      out.held.push({
        workerId: payee,
        what: `commission on ${job.id}`,
        reason: "payee is not a known worker",
      });
      continue;
    }
    if (!onTotal && incomplete.has(job.id)) {
      out.held.push({
        workerId: payee,
        what: `commission on ${job.id}`,
        reason: "job not complete",
      });
      continue;
    }
    const basis = onTotal
      ? job.totalCents
      : (profits.get(job.id)?.profitCents ?? null);
    if (basis === null) {
      out.held.push({
        workerId: payee,
        what: `commission on ${job.id}`,
        reason: onTotal
          ? "job total unknown"
          : (profits.get(job.id)?.reason ?? "job profit unknown"),
      });
      continue;
    }
    const s = sums.get(payee) ?? { num: 0, lines: [] };
    s.num += basis * pctH;
    s.lines.push(
      `${job.id}: ${pctH / 100}% of ${onTotal ? "job total" : "job profit"} ${basis}¢ (rule ${plan.id})`,
    );
    sums.set(payee, s);
  }
  for (const [workerId, s] of [...sums].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (s.num <= 0) {
      out.notes.push(
        `${workerId}: commission basis is not positive; no commission`,
      );
      continue;
    }
    const amountCents = divHalfUp(s.num, 10000);
    out.payouts.push({
      workerId,
      name: "Commission",
      amountCents,
      explain: [...s.lines, `Commission ${amountCents}¢`],
    });
  }
  return out;
}

export function tips(
  rules: Rule[],
  recon: JobRecon[],
  entries: TimeEntry[],
  workers: Worker[],
): Payouts {
  const out: Payouts = { payouts: [], held: [], notes: [] };
  const withTips = recon.filter((r) => r.tipCents > 0);
  if (!withTips.length) return out;
  const pol = active(rules, "tip_policy");
  const split = pol.length === 1 ? pol[0].params.split : null;
  const byWorker = new Map(workers.map((w) => [w.id, w]));
  const acc = new Map<string, { cents: number; lines: string[] }>();
  for (const r of withTips) {
    if (
      pol.length !== 1 ||
      pol[0].params.tipsAllowed === false ||
      (split !== "by_hours_on_job" && split !== "equal")
    ) {
      out.held.push({
        workerId: null,
        what: `tips ${r.tipPaymentIds.join(", ")} on ${r.jobId}`,
        reason:
          pol.length !== 1
            ? "no single active tip_policy rule"
            : `tip_policy ${pol[0].id} does not say how to split`,
      });
      continue;
    }
    const ids = new Set([r.jobId, ...r.childJobIds]);
    const sec = new Map<string, number>();
    for (const e of entries)
      if (e.jobId && ids.has(e.jobId))
        sec.set(e.workerId, (sec.get(e.workerId) ?? 0) + e.durationSec);
    const ws = [...sec.keys()].sort();
    const weight = (w: string) =>
      split === "equal" ? 1 : (sec.get(w) as number);
    const total = ws.reduce((s, w) => s + weight(w), 0);
    if (!total) {
      out.held.push({
        workerId: null,
        what: `tips on ${r.jobId}`,
        reason: "no hours on the job to split by",
      });
      continue;
    }
    let left = r.tipCents;
    ws.forEach((w, i) => {
      const share =
        i === ws.length - 1 ? left : divHalfUp(r.tipCents * weight(w), total);
      left -= share;
      const a = acc.get(w) ?? { cents: 0, lines: [] };
      a.cents += share;
      a.lines.push(
        `${r.jobId}: ${share}¢ of ${r.tipCents}¢ tips (${split}, rule ${pol[0].id}${i === ws.length - 1 ? ", remainder" : ""})`,
      );
      acc.set(w, a);
    });
  }
  for (const [workerId, a] of [...acc].sort(([x], [y]) => x.localeCompare(y)))
    if (a.cents > 0)
      out.payouts.push({
        workerId,
        name:
          byWorker.get(workerId)?.payType === "contractor_venmo"
            ? "Cash Tips"
            : "Paycheck Tips",
        amountCents: a.cents,
        explain: a.lines,
      });
  return out;
}

/** The manager's pct of cycle job profit. Jobs not complete are held out with "job not complete". */
export function managerSplit(
  rules: Rule[],
  allProfits: JobProfit[],
  incomplete: Set<string> = new Set(),
): Payouts {
  const out: Payouts = { payouts: [], held: [], notes: [] };
  const rs = active(rules, "manager_split");
  if (rs.length === 0) return out;
  const profits = allProfits.filter((p) => !incomplete.has(p.jobId));
  for (const r of rs) {
    if (typeof r.params.workerId === "string")
      for (const p of allProfits)
        if (incomplete.has(p.jobId))
          out.held.push({
            workerId: r.params.workerId,
            what: `manager split on ${p.jobId}`,
            reason: "job not complete",
          });
    const w = r.params.workerId;
    const pctH = hundredths(r.params.pctOfJobProfit);
    if (typeof w !== "string" || pctH === null) {
      out.held.push({
        workerId: null,
        what: "manager split",
        reason: `${r.id}: unreadable`,
      });
      continue;
    }
    const unknown = profits.filter((p) => p.profitCents === null);
    if (unknown.length) {
      out.held.push({
        workerId: w,
        what: "manager split",
        reason: `profit unknown for ${unknown.map((p) => `${p.jobId} (${p.reason})`).join(", ")}`,
      });
      continue;
    }
    const total = profits.reduce((s, p) => s + (p.profitCents as number), 0);
    if (total <= 0) {
      out.notes.push(
        `${w}: cycle profit ${total}¢ is not positive; no manager split`,
      );
      continue;
    }
    const amountCents = divHalfUp(total * pctH, 10000);
    out.payouts.push({
      workerId: w,
      name: "Bonus",
      amountCents,
      explain: [
        `${pctH / 100}% of cycle job profit ${total}¢ over ${profits.length} jobs (rule ${r.id}) = ${amountCents}¢`,
      ],
    });
  }
  return out;
}
