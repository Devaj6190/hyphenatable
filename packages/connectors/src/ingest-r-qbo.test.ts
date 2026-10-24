// ingest-r --qbo on SYNTHETIC exports (fake names standing in for real ones).
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { PseudonymMap } from "./anonymize.ts";
import { ingestR } from "./ingest-r.ts";

const sample = (n: string) =>
  fileURLToPath(new URL(`./exports/__fixtures__/${n}`, import.meta.url));

async function qboZip(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Fake Landscaping Co Transactions");
  for (const r of [
    ["Fake Landscaping Co"],
    ["Transaction List by Date"],
    [],
    [
      "Date",
      "Transaction Type",
      "Num",
      "Name",
      "Memo/Description",
      "Account",
      "Customer",
      "Amount",
    ],
    [
      "10/12/2026",
      "Expense",
      "1",
      "Avery Reed",
      "gas for the truck, paid by Avery",
      "Fuel",
      null,
      40,
    ],
    [
      "10/13/2026",
      "Expense",
      "2",
      "Valley Landscape Supply",
      "mulch for Maple Grove",
      "Landscape Supplies",
      "Maple Grove HOA:101",
      214.37,
    ],
    [
      "10/14/2026",
      "Check",
      "3",
      "Pat Quinlan",
      "stump grinding",
      "Subcontractors",
      "Brookside Dental",
      300,
    ],
    [
      "10/15/2026",
      "Deposit",
      null,
      "Brookside Dental",
      null,
      "Sales",
      null,
      980.15,
    ],
  ])
    ws.addRow(r);
  const zip = new JSZip();
  zip.file(
    "Fake Landscaping Co_Transaction List by Date.xlsx",
    (await wb.xlsx.writeBuffer()) as ArrayBuffer,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("ingest-r --qbo", () => {
  it("anonymizes payees and customers, drops memos and workbook names, joins workers and jobs across sources", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-rqbo-")), "r");
    await mkdir(dir, { recursive: true });
    await copyFile(
      sample("jobber-timesheets.sample.xlsx"),
      join(dir, "timesheets.xlsx"),
    );
    await writeFile(
      join(dir, "QBO export Fake Landscaping Co.zip"),
      await qboZip(),
    );
    const c = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: [join(dir, "timesheets.xlsx")],
      journals: [],
      qbo: [join(dir, "QBO export Fake Landscaping Co.zip")],
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    expect(c).toMatchObject({ expenses: 3, timeEntries: 4 });
    expect(c.syncRuns.find((s) => s.object === "qboExpenses")).toMatchObject({
      pulled: 3,
      expected: 3,
      complete: true,
    });

    const out = await readFile(c.outPath as string, "utf8");
    const b = JSON.parse(out);
    const [fuel, mulch, stump] = b.expenses;
    const avery = b.timeEntries[0].workerId;
    const job101 = b.timeEntries[0].jobId;
    // a payee who is a worker is a reimbursement to that worker, not a vendor
    expect(fuel).toMatchObject({
      vendor: null,
      reimbursableToWorkerId: avery,
      description: null,
      accountName: "Fuel",
      amountCents: 4000,
      customerRef: null,
    });
    // "Client:101" joins the Jobber export's Job #101
    expect(mulch).toMatchObject({
      vendor: "Vendor V01",
      customerRef: job101,
      accountName: "Landscape Supplies",
      amountCents: 21437,
      paymentType: "Expense",
    });
    expect(stump).toMatchObject({
      vendor: "Vendor V02",
      reimbursableToWorkerId: null,
    });
    expect(stump.customerRef).toMatch(/^r:c:/);
    expect(
      b.syncRuns.find((s: { object: string }) => s.object === "qboExpenses")
        .method,
    ).toMatch(/^export qbo-xlsx file:[0-9a-f]{10}$/);

    // nothing real survives: payees, customers, memos, the company name, workbook / sheet / file names
    for (const s of [
      "Avery",
      "Reed",
      "Valley",
      "Quinlan",
      "Maple",
      "Grove",
      "Brookside",
      "Dental",
      "mulch",
      "stump",
      "Fake Landscaping",
      "Transaction List",
      "QBO export",
    ]) {
      expect(out).not.toContain(s);
    }
    // every token from the pseudonym map's keys is absent, except vendor words that are also account names
    const map = JSON.parse(
      await readFile(join(dir, "pseudonyms.json"), "utf8"),
    ) as PseudonymMap;
    expect(Object.keys(map.vendors ?? {})).toHaveLength(2);
    const tokens = (await readFile(join(dir, "real-tokens.txt"), "utf8"))
      .trim()
      .split("\n");
    expect(tokens).toEqual(
      expect.arrayContaining(["pat", "quinlan", "valley", "supply", "avery"]),
    );
    expect(tokens).not.toContain("landscape"); // vendor word that is also the "Landscape Supplies" account
    for (const t of tokens)
      expect(out.toLowerCase()).not.toMatch(new RegExp(`\\b${t}\\b`));
  });
});
