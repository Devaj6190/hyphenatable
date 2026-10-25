import { describe, expect, test, vi } from "vitest";
import { wageRows } from "@/components/workbook/data";
import { workbookView } from "@/lib/server/fixtures";

// lib/server/fixtures is server-only; under vitest there is no React server to satisfy the guard.
vi.mock("server-only", () => ({}));

const owner = { role: "owner", workerId: "owner" } as const;
const manager = {
  role: "manager",
  workerId: "a-w11",
  crew: new Set(["a-w11", "a-w01"]),
} as const;

describe("workbookView", () => {
  test("a manager gets nothing: the workbook carries pay", () => {
    for (const company of ["a", "b"])
      expect(workbookView(manager, company)).toBeNull();
  });

  test("the owner gets every cycle with structured wage lines", () => {
    const data = workbookView(owner, "a");
    expect(data?.cycles.length).toBeGreaterThan(0);
    const open = data?.cycles.at(-1);
    expect(open?.basis).toBe("engine");
    expect(open?.stage1.lines.every((l) => Array.isArray(l.earnings))).toBe(
      true,
    );
  });
});

describe("wage rows", () => {
  const cycles = ["a", "b"].flatMap(
    (c) => workbookView(owner, c)?.cycles ?? [],
  );
  const rows = cycles.flatMap((wb) => wageRows(wb).map((r) => ({ wb, r })));

  test("every hourly line in an open cycle has its weeks", () => {
    const hourly = rows.filter(
      ({ wb, r }) => wb.basis === "engine" && r.group === "hourly",
    );
    expect(hourly.length).toBeGreaterThan(0);
    for (const { r } of hourly) expect(r.weeks?.length).toBeGreaterThan(0);
  });

  test("week fields sum to the line's regular and overtime totals", () => {
    const seconds = (
      name: string,
      earnings: { name: string; seconds: number | null }[],
    ) => earnings.find((e) => e.name === name)?.seconds ?? 0;
    for (const { wb, r } of rows) {
      if (!r.weeks) continue;
      const line = wb.stage1.lines.find((l) => l.workerId === r.workerId);
      const sum = (
        k:
          | "seconds"
          | "regularSeconds"
          | "overtimeSeconds"
          | "doubleOvertimeSeconds",
      ) => r.weeks?.reduce((s, w) => s + w[k], 0) ?? 0;
      expect(sum("regularSeconds")).toBe(seconds("Regular Hours", r.earnings));
      expect(sum("overtimeSeconds")).toBe(seconds("Overtime", r.earnings));
      expect(sum("doubleOvertimeSeconds")).toBe(
        seconds("Double Overtime", r.earnings),
      );
      for (const w of r.weeks)
        expect(
          w.regularSeconds + w.overtimeSeconds + w.doubleOvertimeSeconds,
        ).toBe(w.seconds);
      // Hours shown in the row and the stored line's split agree with the weeks.
      expect(sum("seconds") / 3600).toBeCloseTo(r.hours ?? 0, 2);
      expect(line?.regularHours ?? 0).toBeCloseTo(
        sum("regularSeconds") / 3600,
        2,
      );
      expect(line?.overtimeHours ?? 0).toBeCloseTo(
        sum("overtimeSeconds") / 3600,
        2,
      );
    }
  });

  test("earnings sum to gross; nothing in the UI adds pay, so the fixture must", () => {
    for (const { r } of rows)
      if (r.grossCents !== null && r.earnings.length > 0 && r.group !== "held")
        expect(r.earnings.reduce((s, e) => s + e.amountCents, 0)).toBe(
          r.grossCents,
        );
  });

  test("groups come in order: hourly, salary, venmo, held", () => {
    const order = ["hourly", "salary", "venmo", "held"];
    for (const wb of cycles) {
      const groups = wageRows(wb).map((r) => order.indexOf(r.group));
      expect(groups).toEqual([...groups].sort((a, b) => a - b));
    }
  });
});
