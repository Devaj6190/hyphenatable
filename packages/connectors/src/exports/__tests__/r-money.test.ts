// QBO Transaction Detail by Account and Venmo statement readers, on SYNTHETIC replicas.
import { describe, expect, it } from "vitest";
import {
  TDA_ROWS,
  tdaWorkbook,
  VENMO_CSV,
} from "../__fixtures__/make-r-money-replicas.ts";
import { readQboTransactionDetailXlsx } from "../qbo-tda-xlsx.ts";
import { classifyNote, readVenmoCsv } from "../venmo-csv.ts";

const opts = { companyId: "r", now: () => new Date("2026-10-24T12:00:00Z") };

describe("QBO Transaction Detail by Account", () => {
  it("reads lines into their innermost account and checks every Total for row and the TOTAL", async () => {
    const r = await readQboTransactionDetailXlsx(
      { bytes: await tdaWorkbook(), fileName: "t.xlsx" },
      opts,
    );
    expect(r.syncRun.complete).toBe(true);
    expect(r.syncRun.error).toBeNull();
    expect(r.namesAnonymized).toBe(false);
    expect(
      r.rows.map((x) => [x.accountName, x.amountCents, x.date, x.category]),
    ).toEqual([
      ["Job Supplies", 21437, "2026-09-21", "mulch"],
      ["Job Supplies", 10000, "2026-09-24", "soil"],
      ["Fuel", 4800, "2026-09-22", "fuel"],
      ["Contract Labor", 30000, "2026-09-21", expect.anything()],
    ]);
    expect(r.rows[3]).toMatchObject({
      payeeName: "Sam Okafor",
      splitAccount: "Fakebank Checking",
      txnType: "Check",
    });
    expect(JSON.stringify(r.rows)).not.toContain("Brookside");
  });

  it("flags an account whose lines do not add up to its total, and a wrong grand TOTAL", async () => {
    const rows = TDA_ROWS.map((r) =>
      r[0] === "Total for Fuel"
        ? ["Total for Fuel", null, null, null, null, null, null, 49]
        : r,
    );
    const r = await readQboTransactionDetailXlsx(
      { bytes: await tdaWorkbook(rows), fileName: "t.xlsx" },
      opts,
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error ?? "").toContain("4800¢ vs its total row 4900¢");
    const r2 = await readQboTransactionDetailXlsx(
      {
        bytes: await tdaWorkbook(
          TDA_ROWS.map((x) =>
            x[0] === "TOTAL"
              ? ["TOTAL", null, null, null, null, null, null, 1]
              : x,
          ),
        ),
        fileName: "t.xlsx",
      },
      opts,
    );
    expect(r2.syncRun.error ?? "").toContain("grand TOTAL");
  });

  it("reports a workbook without the report header", async () => {
    const r = await readQboTransactionDetailXlsx(
      { bytes: await tdaWorkbook([["nothing here"]]), fileName: "t.xlsx" },
      opts,
    );
    expect(r.syncRun.complete).toBe(false);
  });
});

describe("Venmo statement CSV", () => {
  it("keeps transactions only, in UTC cents with direction; the note becomes a class", async () => {
    const r = await readVenmoCsv({ text: VENMO_CSV, fileName: "v.csv" }, opts);
    expect(r.syncRun.complete).toBe(true);
    expect(
      r.rows.map((x) => [
        x.id,
        x.direction,
        x.amountCents,
        x.counterpartyName,
        x.noteClass,
      ]),
    ).toEqual([
      ["4001", "out", -60000, "Avery Reed", "wage"],
      ["4002", "out", -4800, "Jordan Ellis", "unknown"],
      ["4003", "out", -3550, "Riley Park", "unknown"],
      ["4004", "out", -4000, "sam", "tip"],
      ["4005", "in", 25000, "Riley Park", "unknown"],
      ["4006", "out", -25000, null, "unknown"],
    ]);
    expect(r.rows[0]?.datetime).toBe("2026-09-21T15:02:11.000Z");
    expect(r.rows[5]).toMatchObject({
      fundingRaw: "Venmo balance",
      destinationRaw: "Fakebank Checking *1234",
      hasNote: false,
    });
    const s = JSON.stringify(r.rows);
    for (const n of ["dinner", "rent share", "grabbing", "9/14", "errors"])
      expect(s).not.toContain(n);
  });

  it("classifies notes by exact keywords, first match wins", () => {
    expect(classifyNote("referral bonus")).toBe("referral");
    expect(classifyNote("10% of the Smith job")).toBe("commission");
    expect(classifyNote("tips")).toBe("tip");
    expect(classifyNote("reimburse for gas")).toBe("reimbursement");
    expect(classifyNote("mulch")).toBe("reimbursement");
    expect(classifyNote("trailer rental")).toBe("reimbursement");
    expect(classifyNote("rent share")).toBe("unknown");
    expect(classifyNote("10/5 - 10/11")).toBe("wage");
    expect(classifyNote("this week")).toBe("wage");
    expect(classifyNote("pizza")).toBe("unknown");
    expect(classifyNote(null)).toBe("unknown");
  });

  it("counts an unreadable amount as a problem", async () => {
    const r = await readVenmoCsv(
      { text: VENMO_CSV.replace("- $35.50", "oops"), fileName: "v.csv" },
      opts,
    );
    expect(r.syncRun.complete).toBe(false);
    expect(r.syncRun.error ?? "").toContain("unreadable amount");
  });
});
