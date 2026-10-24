import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Company, Cycle, Flag } from "@payrollpilot/engine/schemas";
import { describe, expect, test } from "vitest";
import { PRODUCT_NAME } from "./brand";
import {
  DASHBOARD_URL_PLACEHOLDER,
  dateRange,
  managerLink,
  managerSummary,
} from "./summary";
import { MAX_LEN, templates } from "./templates";

const fixtures = join(import.meta.dirname, "../../../../data/fixtures/a");
const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(fixtures, name), "utf8")) as T;
const flags = read<Flag[]>("flags.json");
const company = read<Company>("company.json");
const cycle = read<Cycle[]>("cycles.json").find(
  (c) => c.id === "a-c05",
) as Cycle;

const summary = (overrides: Partial<Parameters<typeof managerSummary>[0]>) =>
  managerSummary({
    flags,
    cycle,
    timeZone: company.timezone,
    dashboardUrl: "https://rollpay.app",
    ...overrides,
  });

describe("manager summary", () => {
  test("Company A's current cycle: count, range and top 3 categories from the flags", () => {
    expect(summary({})).toBe(
      "Rollpay: 10 items need you before payroll (Oct 10–23): 3 hour mix-ups, 1 running timer, 1 long shift… Review: https://rollpay.app/c/a/manager",
    );
  });

  test("every template and the summary use the one product name", () => {
    expect(PRODUCT_NAME).toBe("Rollpay");
    for (const text of Object.values(templates))
      expect(text).not.toMatch(/PayrollPilot/);
    expect(summary({})?.startsWith(`${PRODUCT_NAME}:`)).toBe(true);
  });

  test("only open, asked or answered flags routed to the manager in this cycle count", () => {
    const one = flags.find(
      (f) => f.routeTo === "manager" && f.checkId === "CHK-02",
    ) as Flag;
    const others: Flag[] = [
      { ...one, id: "x1", routeTo: "owner" },
      { ...one, id: "x2", status: "corrected" },
      { ...one, id: "x3", cycleId: "a-c04" },
    ];
    expect(summary({ flags: [one, ...others] })).toBe(
      "Rollpay: 1 item needs you before payroll (Oct 10–23): 1 running timer Review: https://rollpay.app/c/a/manager",
    );
  });

  test("nothing for the manager means no text", () => {
    expect(
      summary({ flags: flags.filter((f) => f.routeTo !== "manager") }),
    ).toBeNull();
  });

  test("the link is {DASHBOARD_URL}/c/{companyId}/manager, with a clear placeholder when unset", () => {
    expect(managerLink("https://rollpay.app/", "a")).toBe(
      "https://rollpay.app/c/a/manager",
    );
    for (const unset of [undefined, null, "", "  "])
      expect(managerLink(unset, "a")).toBe(
        `${DASHBOARD_URL_PLACEHOLDER}/c/a/manager`,
      );
    expect(summary({ dashboardUrl: undefined })).toContain(
      `Review: ${DASHBOARD_URL_PLACEHOLDER}/c/a/manager`,
    );
  });

  test("a long link drops categories to stay under the limit; never a dollar amount", () => {
    const dashboardUrl = `https://${"x".repeat(120)}.example.com`;
    const text = summary({ dashboardUrl }) as string;
    expect(text.length).toBeLessThanOrEqual(MAX_LEN);
    expect(text).toContain("3 hour mix-ups");
    expect(text).not.toContain("long shift");
    expect(text).toContain("…");
    expect(text).not.toMatch(/\$/);
  });

  test("a link too long for any version of the text is refused, not sent", () => {
    expect(() =>
      summary({ dashboardUrl: `https://${"x".repeat(240)}.com` }),
    ).toThrow(/240/);
  });

  test("ranges across a month name both months, in the company timezone", () => {
    expect(
      dateRange(
        {
          periodStart: "2026-09-26T04:00:00.000Z",
          periodEnd: "2026-10-10T03:59:59.999Z",
        },
        "America/New_York",
      ),
    ).toBe("Sep 26–Oct 9");
  });
});
