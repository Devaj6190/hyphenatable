// QBO Purchase / Bill -> section 6 Expense. Pure.
// Split rule (plan A-08): when any line carries a CustomerRef (job tag), one Expense per expense line
// (untagged lines keep customerRef null, nothing is dropped); otherwise one Expense for the header total.
// Ids: id = qbo:<Entity>:<Id>[:<LineId>]; sourceId = our seed marker (payrollpilot:<id> in PrivateNote) when
// present, else <Entity>:<Id>, with #<LineId> on split lines. Customer refs are ids only (customer names are clients).

import { toCents } from "../money.ts";
import type { Expense } from "../types.ts";

type Ref = { value: string; name?: string; type?: string };
export interface RawLine {
  Id?: string;
  Amount?: number;
  Description?: string;
  DetailType: string;
  AccountBasedExpenseLineDetail?: { AccountRef?: Ref; CustomerRef?: Ref };
  ItemBasedExpenseLineDetail?: { ItemRef?: Ref; CustomerRef?: Ref };
}
export interface RawPurchase {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  PaymentType?: string;
  Credit?: boolean;
  PrivateNote?: string;
  EntityRef?: Ref;
  Line?: RawLine[];
}
export interface RawBill {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  PrivateNote?: string;
  VendorRef?: Ref;
  Line?: RawLine[];
}

const MARKER = /payrollpilot:([A-Za-z0-9_-]+)/;
export const seedMarker = (note: string | undefined): string | null =>
  MARKER.exec(note ?? "")?.[1] ?? null;

const detail = (l: RawLine) =>
  l.AccountBasedExpenseLineDetail ?? l.ItemBasedExpenseLineDetail;
/**
 * The seed pusher names the accounts and vendors it creates "<name> (payrollpilot)" (marker in the record).
 * Strip exactly that trailing suffix so rules and fixtures keyed by the bare name still match.
 */
export const stripSeedSuffix = (
  name: string | null | undefined,
): string | null =>
  name == null ? null : name.replace(/ \(payrollpilot\)$/, "");
const accountOf = (l: RawLine) =>
  stripSeedSuffix(l.AccountBasedExpenseLineDetail?.AccountRef?.name);
const customerOf = (l: RawLine) => {
  const v = detail(l)?.CustomerRef?.value;
  return v ? `qbo:Customer:${v}` : null;
};
const negate = (c: number | null) => (c === null || c === 0 ? c : -c);

function toExpenses(
  entity: "Purchase" | "Bill",
  raw: {
    Id: string;
    TxnDate: string;
    TotalAmt: number;
    PrivateNote?: string;
    Line?: RawLine[];
  },
  companyId: string,
  vendor: string | null,
  paymentType: string | null,
  credit: boolean,
): Expense[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.TxnDate))
    throw new Error(
      `QBO ${entity} ${raw.Id}: unexpected TxnDate ${JSON.stringify(raw.TxnDate)}`,
    );
  const lines = (raw.Line ?? []).filter((l) => detail(l));
  const marker = seedMarker(raw.PrivateNote);
  const sign = (c: number | null) => (credit ? negate(c) : c);
  const base = {
    companyId,
    source: "qbo" as const,
    date: raw.TxnDate,
    vendor,
    paymentType,
    kind: "unknown" as const,
    matchedJobId: null,
    matchConfidence: null,
    reimbursableToWorkerId: null,
    reimbursementStatus: null,
  };
  if (lines.some(customerOf)) {
    return lines.map((l, i) => {
      const lineId = l.Id ?? String(i + 1);
      return {
        ...base,
        id: `qbo:${entity}:${raw.Id}:${lineId}`,
        sourceId: `${marker ?? `${entity}:${raw.Id}`}#${lineId}`,
        amountCents: sign(toCents(l.Amount)),
        description: l.Description?.trim() || null,
        accountName: accountOf(l),
        customerRef: customerOf(l),
      };
    });
  }
  const accounts = new Set(lines.map(accountOf));
  const descriptions = lines.map((l) => l.Description?.trim()).filter(Boolean);
  return [
    {
      ...base,
      id: `qbo:${entity}:${raw.Id}`,
      sourceId: marker ?? `${entity}:${raw.Id}`,
      amountCents: sign(toCents(raw.TotalAmt)),
      description: descriptions.length ? descriptions.join("; ") : null,
      // one account across all lines -> that account; mixed -> null (never pick one)
      accountName: accounts.size === 1 ? ([...accounts][0] ?? null) : null,
      customerRef: null,
    },
  ];
}

export const normalizePurchase = (
  p: RawPurchase,
  companyId: string,
): Expense[] =>
  toExpenses(
    "Purchase",
    p,
    companyId,
    p.EntityRef?.type === "Vendor" ? stripSeedSuffix(p.EntityRef.name) : null,
    p.PaymentType ?? null,
    p.Credit === true,
  );

export const normalizeBill = (b: RawBill, companyId: string): Expense[] =>
  toExpenses(
    "Bill",
    b,
    companyId,
    stripSeedSuffix(b.VendorRef?.name),
    null,
    false,
  );
