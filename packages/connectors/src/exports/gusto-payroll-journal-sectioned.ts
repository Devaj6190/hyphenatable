// Gusto "Payroll Journal Report" CSV, sectioned layout (Company R's real export; tested only on synthetic
// replicas). Preamble lines, then per payroll:
//   <title>  /  Pay period, MM/DD/YYYY - MM/DD/YYYY  /  Pay day, MM/DD/YYYY  /  30-column header  /
//   employee rows  /  Payroll Totals block
// Employee rows: the first row has Last, First, Employee Type; then one line per (Job, Pay Type): itemized
// lines per job (Job = a role such as "Landscaper", each with its own Rate) or with no job, then SUBTOTAL
// lines per pay type with Job = "Totals", then often a "Gross" line.
// Read ONLY: names, employee type, job, pay type, hours, rate, amount; period, pay day, section kind. Payment
// (the payment METHOD), tax columns, Work Address, Net Pay, Check Amount, Employer Cost and Donations are never
// read (only mapped columns are indexed).
// Rules (per employee and for the Payroll Totals block alike):
//   itemized = lines whose Job is not "Totals" and Pay Type is not "Gross"; "Totals" lines are never added,
//   only checked: per pay type, the Totals line == the sum of that pay type's itemized lines;
//   gross = the Gross line if present, else the itemized sum; when both exist they must agree.
// An employee with no pay lines at all is gross 0 from the source (a note). The Payroll Totals gross must equal
// the sum of employee gross. "Owner's Draw" lines / "Owner’s draw" employees are owner draws.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseScaled, toCents } from "../money.ts";
import {
  type Cell,
  cellDate,
  type ExportResult,
  exportSyncRun,
  isBlank,
  locateHeader,
  type Mapping,
  parseCsv,
  text,
} from "./common.ts";
import type { PayrollJournalRow } from "./gusto-payroll-journal-csv.ts";

type Key =
  | "last"
  | "first"
  | "employeeType"
  | "job"
  | "payType"
  | "hours"
  | "rate"
  | "amount";
export const SECTIONED_COLUMNS: Mapping<Key> = {
  last: ["Last Name"],
  first: ["First Name"],
  employeeType: ["Employee Type"],
  job: ["Job"],
  payType: ["Pay Type"],
  hours: ["Hours"],
  rate: ["Rate"],
  amount: ["Amount"],
};

export type SectionKind = "regular" | "off_cycle" | "other";
export const sectionKind = (title: string): SectionKind =>
  /^regular\b/i.test(title.trim())
    ? "regular"
    : /off-/i.test(title)
      ? "off_cycle"
      : "other";

const US_DATE = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
const isOwnerDraw = (s: string | null) =>
  !!s && /owner.?s\s*draw/i.test(s.replace(/[’']/g, "'"));
const dateAfter = (row: Cell[], i: number): string | undefined =>
  row
    .slice(i)
    .map((c) => text(c) ?? "")
    .join(" ")
    .match(US_DATE)?.[0];
const isTotalsJob = (job: string | null) => !!job && /^totals?$/i.test(job);

/** One employee's (or the Payroll Totals block's) lines: itemized, per-type subtotals, the Gross line. */
class LineBlock {
  itemized = 0;
  items = 0;
  gross: number | null = null;
  readonly byType = new Map<string, number>();
  readonly subtotals = new Map<string, number>();

  /** returns true when the line was itemized (so the caller records its earnings detail) */
  add(job: string | null, type: string, amount: number | null): boolean {
    if (/^gross$/i.test(type)) {
      this.gross = amount;
      return false;
    }
    if (amount === null) return false;
    if (isTotalsJob(job)) {
      this.subtotals.set(type, (this.subtotals.get(type) ?? 0) + amount);
      return false;
    }
    this.itemized += amount;
    this.items++;
    this.byType.set(type, (this.byType.get(type) ?? 0) + amount);
    return true;
  }

  /** cross-checks; problems are pushed with `where` (row / section numbers only) */
  check(where: string, problems: string[]): void {
    for (const [type, sub] of this.subtotals) {
      const items = this.byType.get(type) ?? 0;
      if (sub !== items)
        problems.push(
          `${where}: "${type}" Totals line ${sub}¢ vs its itemized lines ${items}¢`,
        );
    }
    if (this.gross !== null && this.items > 0 && this.gross !== this.itemized) {
      problems.push(
        `${where}: Gross line ${this.gross}¢ vs itemized lines ${this.itemized}¢`,
      );
    }
  }

  value(): number | null {
    return this.gross ?? (this.items > 0 ? this.itemized : null);
  }
}

export async function readGustoPayrollJournalSectionedCsv(
  input: string | { text: string; fileName: string },
  opts: { companyId: string; now?: () => Date },
): Promise<ExportResult<PayrollJournalRow>> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const fileName = typeof input === "string" ? basename(input) : input.fileName;
  const grid: Cell[][] = parseCsv(
    typeof input === "string" ? await readFile(input, "utf8") : input.text,
  );
  const method = `export gusto-payroll-journal-sectioned ${fileName}`;
  const problems: string[] = [];
  const rows: PayrollJournalRow[] = [];
  let expected = 0;
  let sections = 0;
  let zeroGross = 0;

  const lastTitle = (before: number): string => {
    for (let i = before - 1; i >= 0; i--) {
      const row = grid[i] ?? [];
      if (!isBlank(row)) return text(row[0]) ?? "";
    }
    return "";
  };

  let r = 0;
  while (r < grid.length) {
    const row = grid[r] ?? [];
    if (!/^pay period$/i.test(text(row[0]) ?? "")) {
      r++;
      continue;
    }
    // ---- a section ----
    sections++;
    const section = sections;
    const kind = sectionKind(lastTitle(r));
    const where = `section ${section}`;
    const period =
      row
        .slice(1)
        .map((c) => text(c) ?? "")
        .join(" ")
        .match(US_DATE) ?? [];
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    try {
      periodStart = period[0] ? cellDate(period[0]) : null;
      periodEnd = period[1] ? cellDate(period[1]) : null;
    } catch {
      problems.push(`${where}: unreadable pay period`);
    }
    r++;
    let payDay: string | null = null;
    while (r < grid.length && isBlank(grid[r])) r++;
    if (/^pay day$/i.test(text(grid[r]?.[0]) ?? "")) {
      const d = dateAfter(grid[r] ?? [], 1);
      try {
        payDay = d ? cellDate(d) : null;
      } catch {
        problems.push(`${where}: unreadable pay day`);
      }
      r++;
    }
    let header: ReturnType<typeof locateHeader<Key>>;
    try {
      header = locateHeader<Key>(grid.slice(r, r + 5), SECTIONED_COLUMNS, [
        ["last"],
        ["first"],
        ["payType"],
        ["amount"],
      ]);
    } catch {
      problems.push(`${where}: no employee header`);
      continue;
    }
    const cols = header.cols;
    const at = (x: Cell[], k: Key) =>
      cols[k] === undefined ? null : (x[cols[k] as number] ?? null);
    r += header.headerRow + 1;

    let current: PayrollJournalRow | null = null;
    let block = new LineBlock();
    let totalsBlock: LineBlock | null = null;
    let sectionGross = 0;
    const finish = () => {
      if (current) {
        block.check(`${where} row ${current.rowNumber}`, problems);
        const gross = block.value();
        if (gross === null) zeroGross++;
        current.grossCents = gross ?? 0;
        sectionGross += current.grossCents;
        rows.push(current);
      }
      current = null;
      block = new LineBlock();
    };
    for (; r < grid.length; r++) {
      const x = grid[r] ?? [];
      if (isBlank(x)) continue;
      const first0 = text(x[0]);
      if (first0 && /^pay period$/i.test(first0)) break; // next section without a totals row
      const last = text(at(x, "last"));
      const firstName = text(at(x, "first"));
      const type = text(at(x, "payType"));
      const job = text(at(x, "job"));
      let amount: number | null = null;
      try {
        amount = toCents(text(at(x, "amount")));
      } catch {
        problems.push(`${where} row ${r + 1}: unreadable amount`);
        continue;
      }
      if (last && /^payroll totals?$/i.test(last)) {
        finish();
        totalsBlock = new LineBlock();
        // an Amount with no pay type on the totals row itself is the section's gross
        if (type) totalsBlock.add(job, type, amount);
        else if (amount !== null) totalsBlock.gross = amount;
        continue;
      }
      if (totalsBlock) {
        if (last || firstName || (!type && first0)) break; // something else began: the section is over
        if (type) totalsBlock.add(job, type, amount);
        continue;
      }
      if (last || firstName) {
        finish();
        expected++;
        const employeeType = text(at(x, "employeeType"));
        current = {
          rowNumber: r + 1,
          employeeName: [firstName, last].filter(Boolean).join(" "),
          periodStart,
          periodEnd,
          checkDate: payDay,
          grossCents: 0,
          netCents: null,
          earningsCents: {},
          hours: {},
          sectionKind: kind,
          section,
          employeeType,
          payKind: isOwnerDraw(employeeType) ? "owner_draw" : "wage",
          ratesCents: {},
          jobLines: [],
        };
      }
      if (!type) continue;
      if (!current) {
        problems.push(`${where} row ${r + 1}: pay line before any employee`);
        continue;
      }
      const cur = current as PayrollJournalRow;
      try {
        if (!block.add(job, type, amount)) continue; // Gross line or a Totals subtotal: checked, not added
        if (isOwnerDraw(type)) cur.payKind = "owner_draw";
        const hours = parseScaled(text(at(x, "hours")), 3);
        const rate = toCents(text(at(x, "rate")));
        cur.earningsCents[type] =
          (cur.earningsCents[type] ?? 0) + (amount ?? 0);
        if (hours !== null)
          cur.hours[type] = (cur.hours[type] ?? 0) + hours / 1000;
        // per-pay-type rate only when unambiguous; per-job rates are in jobLines (M4 needs them)
        if (rate !== null && cur.ratesCents) {
          if (cur.ratesCents[type] === undefined) cur.ratesCents[type] = rate;
          else if (cur.ratesCents[type] !== rate) delete cur.ratesCents[type];
        }
        cur.jobLines?.push({
          job,
          payType: type,
          hours: hours === null ? null : hours / 1000,
          rateCents: rate,
          amountCents: amount ?? 0,
        });
      } catch {
        problems.push(`${where} row ${r + 1}: unreadable pay line`);
      }
    }
    finish();
    const tb = totalsBlock as LineBlock | null;
    if (tb) tb.check(`${where} Payroll Totals`, problems);
    const totals = tb?.value() ?? null;
    if (totals === null) problems.push(`${where}: no Payroll Totals amount`);
    else if (totals !== sectionGross)
      problems.push(
        `${where}: employee gross sum ${sectionGross}¢ vs Payroll Totals ${totals}¢`,
      );
  }
  if (!sections) problems.push("no payroll sections (no 'Pay period' line)");
  const notes = zeroGross
    ? [
        `${zeroGross} employee row(s) with no pay lines: gross 0 from the source`,
      ]
    : [];
  return {
    rows,
    namesAnonymized: false,
    syncRun: exportSyncRun(
      opts.companyId,
      "payrollJournal",
      method,
      startedAt,
      now().toISOString(),
      rows.length,
      expected,
      problems,
      notes,
    ),
  };
}

/** True when a CSV looks like the sectioned journal (a "Pay period" line). */
export const isSectionedJournal = (csvText: string): boolean =>
  /^\s*"?pay period"?\s*,/im.test(csvText);
