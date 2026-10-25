// Company R money sources -> anonymized records: the QBO Transaction Detail by Account ledger and Venmo
// statements. Payees / counterparties who are known workers become worker ids (one person, one worker id
// across every source); anyone else becomes "Vendor Vnn" (ledger) or "Party Pnn" (Venmo) and is never payroll.
// Funding sources become tokens (bank:A, venmo_balance). Notes and descriptions never arrive here.

import type { AnonJobberExpense } from "./anonymize-reports.ts";
import type { Category } from "./exports/keywords.ts";
import type { LedgerLine } from "./exports/qbo-tda-xlsx.ts";
import type { NoteClass, VenmoRow } from "./exports/venmo-csv.ts";

export interface MoneyHelpers {
  /** worker id for a name that is a known worker, else null */
  knownWorker: (realName: string) => string | null;
  vendorName: (realName: string) => string;
  partyName: (realName: string) => string;
  fundingToken: (raw: string | null) => string | null;
}

export interface AnonLedgerLine {
  id: string;
  sourceId: string;
  date: string;
  txnType: string | null;
  accountName: string | null;
  splitAccount: string | null;
  amountCents: number;
  payeeWorkerId: string | null;
  vendor: string | null;
  category: Category | null;
}

export type VenmoClass = NoteClass | "personal_or_unknown";
export interface AnonVenmo {
  id: string;
  sourceId: string;
  datetime: string;
  venmoType: string | null;
  status: string | null;
  direction: "in" | "out";
  amountCents: number;
  tipCents: number | null;
  feeCents: number | null;
  counterpartyWorkerId: string | null;
  counterparty: string | null;
  fundingToken: string | null;
  destinationToken: string | null;
  /** payroll-relevant class: only for known workers; everyone else is personal_or_unknown */
  class: VenmoClass;
  noteClass: NoteClass;
  matchedExpenseId: string | null;
  hasNote: boolean;
}

export interface VenmoSummary {
  byClass: Record<string, { count: number; cents: number }>;
  byFunding: Record<
    string,
    { count: number; outCents: number; inCents: number; workerPayments: number }
  >;
}

// bank / card accounts carry the bank's name or digits: they become the same kind of token as Venmo funding
const BANKISH = /checking|savings|\bbank\b|credit card|\bcard\b|\d{4}/i;
const account = (h: MoneyHelpers, n: string | null) =>
  n && BANKISH.test(n) ? h.fundingToken(n) : n;

export function anonymizeLedger(
  h: MoneyHelpers,
  files: { fileTag: string; rows: LedgerLine[] }[],
): AnonLedgerLine[] {
  return files.flatMap((f) =>
    f.rows.map((r) => {
      const worker = r.payeeName ? h.knownWorker(r.payeeName) : null;
      return {
        id: `export:ledger:${f.fileTag}:${r.sheet}:${r.rowNumber}`,
        sourceId: `xlsx:${f.fileTag}#s${r.sheet}row${r.rowNumber}`,
        date: r.date,
        txnType: r.txnType,
        accountName: account(h, r.accountName),
        splitAccount: account(h, r.splitAccount),
        amountCents: r.amountCents,
        payeeWorkerId: worker,
        vendor: r.payeeName && !worker ? h.vendorName(r.payeeName) : null,
        category: r.category,
      };
    }),
  );
}

const DAY = 86_400_000;

export function anonymizeVenmo(
  h: MoneyHelpers,
  files: { fileTag: string; rows: VenmoRow[] }[],
  jobberExpenses: AnonJobberExpense[],
): { venmo: AnonVenmo[]; venmoSummary: VenmoSummary } {
  const claimed = new Set<string>();
  const venmo: AnonVenmo[] = files.flatMap((f) =>
    f.rows.map((r) => {
      const worker = r.counterpartyName
        ? h.knownWorker(r.counterpartyName)
        : null;
      // a payment to a worker equal to a Jobber expense (amount, date +-1 day) is that expense's reimbursement
      let matched: AnonJobberExpense | undefined;
      if (worker && r.direction === "out") {
        const t = Date.parse(r.datetime.slice(0, 10));
        matched = jobberExpenses.find(
          (x) =>
            !claimed.has(x.id) &&
            x.amountCents === -r.amountCents &&
            x.date !== null &&
            Math.abs(Date.parse(x.date) - t) <= DAY,
        );
        if (matched) claimed.add(matched.id);
      }
      const cls: VenmoClass = !worker
        ? "personal_or_unknown"
        : matched
          ? "reimbursement"
          : r.noteClass;
      return {
        id: `export:venmo:${r.id}`,
        sourceId: `venmo:${r.id}`,
        datetime: r.datetime,
        venmoType: r.venmoType,
        status: r.status,
        direction: r.direction,
        amountCents: r.amountCents,
        tipCents: r.tipCents,
        feeCents: r.feeCents,
        counterpartyWorkerId: worker,
        counterparty:
          r.counterpartyName && !worker
            ? h.partyName(r.counterpartyName)
            : null,
        fundingToken: h.fundingToken(r.fundingRaw),
        destinationToken: h.fundingToken(r.destinationRaw),
        class: cls,
        noteClass: r.noteClass,
        matchedExpenseId: matched?.id ?? null,
        hasNote: r.hasNote,
      };
    }),
  );
  const byClass: VenmoSummary["byClass"] = {};
  const byFunding: VenmoSummary["byFunding"] = {};
  for (const v of venmo) {
    byClass[v.class] ??= { count: 0, cents: 0 };
    const c = byClass[v.class] as { count: number; cents: number };
    c.count++;
    c.cents += v.amountCents;
    const key = v.fundingToken ?? (v.direction === "in" ? "incoming" : "none");
    byFunding[key] ??= { count: 0, outCents: 0, inCents: 0, workerPayments: 0 };
    const fsum = byFunding[key] as VenmoSummary["byFunding"][string];
    fsum.count++;
    if (v.direction === "out") fsum.outCents += -v.amountCents;
    else fsum.inCents += v.amountCents;
    if (v.counterpartyWorkerId && v.direction === "out") fsum.workerPayments++;
  }
  return { venmo, venmoSummary: { byClass, byFunding } };
}
