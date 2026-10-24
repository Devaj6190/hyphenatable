// Synthetic QBO exports built in memory (fake vendors and customers). Layout is a guess until a real file.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readQboXlsx } from "../qbo-xlsx.ts";

type Row = (string | number | Date | null)[];
async function book(sheets: Record<string, Row[]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const HEADER = [
  "Date",
  "Transaction Type",
  "Num",
  "Name",
  "Memo/Description",
  "Account",
  "Customer",
  "Amount",
];
const transactionList: Row[] = [
  ["Fake Landscaping Co"],
  ["Transaction List by Date"],
  ["October 10-23, 2026"],
  [],
  HEADER,
  [
    new Date(Date.UTC(2026, 9, 12)),
    "Expense",
    "1042",
    "Valley Landscape Supply",
    "Mulch",
    "Materials",
    "Maple Grove HOA:101",
    214.37,
  ],
  [
    "10/14/2026",
    "Check",
    "2210",
    "Rent-All Equipment",
    "Aerator",
    "Equipment Rental",
    null,
    "1,250.00",
  ],
  [
    "10/15/2026",
    "Credit Card Credit",
    null,
    "Valley Landscape Supply",
    "Return",
    "Materials",
    null,
    -35.5,
  ],
  [
    "10/16/2026",
    "Deposit",
    null,
    "Brookside Dental",
    null,
    "Sales",
    null,
    980.15,
  ],
  [
    "10/20/2026",
    "Bill",
    "B-77",
    "Metro Disposal",
    "Dump fees",
    "Disposal",
    "Brookside Dental:102",
    85,
  ],
  ["Total", null, null, null, null, null, null, 2494.02],
];
const opts = { companyId: "r", now: () => new Date("2026-10-24T12:00:00Z") };

describe("readQboXlsx", () => {
  it("reads expense-type lines from a zip of workbooks; skips other types, other sheets and structure rows", async () => {
    const zip = new JSZip();
    zip.file(
      "Fake Co_Profit and Loss.xlsx",
      await book({
        "Profit and Loss": [["Profit and Loss"], ["Income", 980.15]],
      }),
    );
    zip.file(
      "Fake Co_Transaction List by Date.xlsx",
      await book({ "Transaction List by Date": transactionList }),
    );
    zip.file("__MACOSX/._junk.xlsx", "x");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const r = await readQboXlsx({ bytes, fileName: "export.zip" }, opts);
    expect(r.namesAnonymized).toBe(false);
    expect(r.syncRun).toMatchObject({
      source: "export",
      object: "qboExpenses",
      pulled: 4,
      expected: 4,
      complete: true,
      error: null,
    });
    expect(r.syncRun.method).toContain("Transaction List by Date");
    expect(
      r.rows.map((x) => [
        x.date,
        x.txnType,
        x.amountCents,
        x.accountName,
        x.customerName,
      ]),
    ).toEqual([
      ["2026-10-12", "Expense", 21437, "Materials", "Maple Grove HOA:101"],
      ["2026-10-14", "Check", 125000, "Equipment Rental", null],
      ["2026-10-15", "Credit Card Credit", -3550, "Materials", null],
      ["2026-10-20", "Bill", 8500, "Disposal", "Brookside Dental:102"],
    ]);
    expect(r.rows[0]).toMatchObject({
      workbook: "Fake Co_Transaction List by Date.xlsx",
      rowNumber: 6,
      num: "1042",
      payeeName: "Valley Landscape Supply",
      memo: "Mulch",
    });
  });

  it("a bare .xlsx with no type column keeps every line and checks the report total", async () => {
    const rows: Row[] = [
      ["Date", "Name", "Category", "Amount"],
      ["Materials"], // group heading
      ["2026-10-12", "Valley Landscape Supply", "Materials", 214.37],
      ["Total for Materials", null, null, 214.37],
      ["2026-10-13", "Highway 9 Fuel", "Fuel", 40],
      ["Total", null, null, 300],
    ];
    const r = await readQboXlsx(
      { bytes: await book({ Purchases: rows }), fileName: "purchases.xlsx" },
      opts,
    );
    expect(r.syncRun).toMatchObject({
      pulled: 2,
      expected: 2,
      complete: false,
      error: "Purchases: amount sum 25437¢ vs report total 30000¢",
    });
  });

  it("unreadable lines and files with no transaction sheet are incomplete, naming the row only", async () => {
    const bad = await readQboXlsx(
      {
        bytes: await book({
          T: [
            HEADER,
            [
              "someday",
              "Expense",
              null,
              "Secret Payee",
              null,
              "Fuel",
              null,
              10,
            ],
          ],
        }),
        fileName: "t.xlsx",
      },
      opts,
    );
    expect(bad.syncRun).toMatchObject({
      pulled: 0,
      expected: 1,
      complete: false,
      error: "T row 2: unreadable date",
    });
    const none = await readQboXlsx(
      { bytes: await book({ Notes: [["nothing here"]] }), fileName: "n.xlsx" },
      opts,
    );
    expect(none.syncRun).toMatchObject({
      complete: false,
      error: "no sheet with a transaction header (date, amount)",
    });
    await expect(
      readQboXlsx(
        { bytes: new TextEncoder().encode("a,b"), fileName: "x.csv" },
        opts,
      ),
    ).rejects.toThrow(/not an xlsx or zip/);
  });
});
