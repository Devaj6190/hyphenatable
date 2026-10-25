import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CheckId,
  type Company,
  type Cycle,
  type Flag,
} from "@payrollpilot/engine/schemas";
import { describe, expect, test } from "vitest";
import { dateRange, managerLink, managerSummary, topIssue } from "./summary";
import { issuePhrases, MAX_LEN, render } from "./templates";

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
    managerFirstName: "Dakota",
    dashboardUrl: "https://rollpay.app",
    ...overrides,
  });

const timer = flags.find(
  (f) => f.routeTo === "manager" && f.checkId === "CHK-02",
) as Flag;

describe("manager summary", () => {
  test("many items: count, range and the most common flag type, then the link", () => {
    expect(summary({})).toBe(
      "Hi Dakota, before we run payroll (Oct 10–23) there are 10 timesheet items to check, mostly duplicate or zero-hour entries.\nDetails here: https://rollpay.app/c/a/manager",
    );
  });

  test("one item: 'there is 1 timesheet item', and 'about' instead of 'mostly'", () => {
    expect(summary({ flags: [timer] })).toBe(
      "Hi Dakota, before we run payroll (Oct 10–23) there is 1 timesheet item to check, about a timer left running.\nDetails here: https://rollpay.app/c/a/manager",
    );
  });

  test("no DASHBOARD_URL: the Details here line is left out, never a placeholder", () => {
    for (const dashboardUrl of [undefined, null, "", "  "]) {
      expect(summary({ dashboardUrl })).toBe(
        "Hi Dakota, before we run payroll (Oct 10–23) there are 10 timesheet items to check, mostly duplicate or zero-hour entries.",
      );
      expect(summary({ flags: [timer], dashboardUrl })).toBe(
        "Hi Dakota, before we run payroll (Oct 10–23) there is 1 timesheet item to check, about a timer left running.",
      );
    }
    expect(summary({ dashboardUrl: null })).not.toMatch(/Details|\[|\n/);
    expect(managerLink(undefined, "a")).toBeNull();
    expect(managerLink("https://rollpay.app/", "a")).toBe(
      "https://rollpay.app/c/a/manager",
    );
  });

  test("reads like a person: no product prefix, no bullets or dots, no dollar amount", () => {
    for (const text of [
      summary({}),
      summary({ dashboardUrl: null }),
      summary({ flags: [timer] }),
    ] as string[]) {
      expect(text.startsWith("Hi Dakota,")).toBe(true);
      expect(text).not.toMatch(/Rollpay:|·|•|\$/);
      expect(text.length).toBeLessThanOrEqual(MAX_LEN);
    }
  });

  test("only open, asked or answered flags routed to the manager in this cycle count", () => {
    const others: Flag[] = [
      { ...timer, id: "x1", routeTo: "owner" },
      { ...timer, id: "x2", status: "corrected" },
      { ...timer, id: "x3", cycleId: "a-c04" },
    ];
    expect(summary({ flags: [timer, ...others] })).toContain(
      "there is 1 timesheet item to check, about a timer left running.",
    );
    expect(
      summary({ flags: flags.filter((f) => f.routeTo !== "manager") }),
    ).toBeNull();
  });

  test("the most common flag type wins; a tie goes to the lower check number", () => {
    const longShift = { ...timer, checkId: "CHK-03" as const };
    expect(topIssue([longShift, timer, longShift])).toBe("CHK-03");
    expect(topIssue([longShift, timer])).toBe("CHK-02");
  });

  test("every flag type has a phrase, and each fits the limit with a long name and link", () => {
    for (const checkId of CheckId.options) {
      const phrase = issuePhrases[checkId];
      expect(phrase.one.length).toBeGreaterThan(0);
      expect(phrase.many.length).toBeGreaterThan(0);
      const flag = { ...timer, checkId };
      const many = summary({
        flags: [flag, { ...flag, id: "x" }],
        managerFirstName: "Maximiliana",
        dashboardUrl: "https://rollpay-dashboard-preview.vercel.app",
      }) as string;
      expect(many).toContain(`mostly ${phrase.many}.`);
      expect(many.length).toBeLessThanOrEqual(MAX_LEN);
    }
  });

  test("render refuses a text over the limit or with a dollar amount", () => {
    expect(() =>
      summary({ dashboardUrl: `https://${"x".repeat(200)}.com` }),
    ).toThrow(/240/);
    expect(() =>
      render("managerSummary", {
        link: "https://rollpay.app/c/a/manager",
        name: "Dakota",
        range: "Oct 10–23",
        count: "10",
        issue: "$120 in tips",
      }),
    ).toThrow(/dollar/);
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
