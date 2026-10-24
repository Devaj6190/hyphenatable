// Output shaping for the B-02 contract (packages/engine/src/schemas.ts, parsed with .strict()).
// Applied by every generator at output time, so generation logic stays unchanged.

type Rec = Record<string, unknown>;

/** Expense: Jobber reimbursement fields; null when not reimbursable (every seeded expense, and all QuickBooks). */
export const withReimbursement = (rows: Rec[]): Rec[] =>
  rows.map((r) => ({
    ...r,
    reimbursableToWorkerId: r.reimbursableToWorkerId ?? null,
    reimbursementStatus: r.reimbursementStatus ?? null,
  }));

/**
 * PastPayroll: `sourceId` (Gusto payroll uuid or Venmo export row id upstream). Seeded rows have no upstream
 * record, so sourceId = our row id, inserted after cycleId to keep the contract's field order.
 */
export const withPayrollSourceId = (rows: Rec[]): Rec[] =>
  rows.map((r) => {
    const out: Rec = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "sourceId") continue;
      out[k] = v;
      if (k === "cycleId") out.sourceId = r.sourceId ?? r.id;
    }
    return out;
  });

/** Company: settings.lowMarginPct (CHK-21 threshold) from the company config. */
export const withLowMargin = (company: Rec, lowMarginPct: number): Rec => ({
  ...company,
  settings: { ...(company.settings as Rec), lowMarginPct },
});
