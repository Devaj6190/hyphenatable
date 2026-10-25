import {
  InterpretationKind,
  InterpretationOutput,
} from "@payrollpilot/engine/schemas";
import { describe, expect, test } from "vitest";
import {
  audience,
  isStop,
  MAX_FOLLOW_UPS,
  MAX_LEN,
  nextStep,
  numberedOptions,
  optionIndexFromReply,
  optionNumber,
  render,
  type TemplateKey,
  templates,
} from "./templates";

// Realistic fake values, long enough to push each template toward the limit.
const longest: Record<TemplateKey, Record<string, string>> = {
  managerPage: {
    n: "12",
    day: "Wednesday",
    link: "https://rollpay.app/c/a/manager",
  },
  managerSummary: {
    name: "Alexandria",
    range: "Sep 26–Oct 9",
    count: "12",
    issue: "purchases not sorted as job cost or overhead",
    link: "https://rollpay-dashboard-preview.vercel.app/c/a/manager",
  },
  managerSummaryNoLink: {
    name: "Alexandria",
    range: "Sep 26–Oct 9",
    count: "12",
    issue: "purchases not sorted as job cost or overhead",
  },
  managerSummaryOneNoLink: {
    name: "Alexandria",
    range: "Sep 26–Oct 9",
    issue: "a purchase not sorted as job cost or overhead",
  },
  managerSummaryOne: {
    name: "Alexandria",
    range: "Sep 26–Oct 9",
    issue: "a purchase not sorted as job cost or overhead",
    link: "https://rollpay-dashboard-preview.vercel.app/c/a/manager",
  },
  ownerPage: {
    n: "12",
    day: "Wednesday",
    link: "https://rollpay.app/c/a",
  },
  entryNoJob: {
    who: "Casey Lindqvist",
    date: "Wed Oct 22",
    hours: "10.5",
    jobA: "Job 118 hedge cleanup",
    jobB: "Job 121 site prep",
  },
  overlap: {
    who: "Casey Lindqvist",
    date: "Wed Oct 22",
    a: "7:30-15:30 Job 118",
    b: "12:00-16:00 Job 121",
  },
  openTimer: { who: "Casey Lindqvist", date: "Wed Oct 22", start: "7:30am" },
  longShift: { who: "Casey Lindqvist", date: "Wed Oct 22", hours: "13.5" },
  expenseNoJob: {
    who: "Dakota Brennan",
    vendor: "Home Depot",
    date: "Wed Oct 22",
    jobA: "Job 118 hedge cleanup",
    jobB: "Job 121 site prep",
  },
  venmoRate: { who: "Harper Nakamura" },
  followUp: {
    restatement: "the 7:30-15:30 entry on Wed Oct 22 was Job 118, not Job 121",
  },
  held: { day: "Wednesday", who: "Casey Lindqvist" },
  stopAck: {},
};

const keys = Object.keys(templates) as TemplateKey[];

describe("templates", () => {
  test.each(
    keys,
  )("%s renders under the limit with no placeholder left", (key) => {
    const text = render(key, longest[key]);
    expect(text.length).toBeLessThanOrEqual(MAX_LEN);
    expect(text).not.toMatch(/[{}]/);
  });

  test("questions with choices list numbered options from 1", () => {
    for (const key of [
      "entryNoJob",
      "overlap",
      "longShift",
      "expenseNoJob",
    ] as const) {
      const numbers = [
        ...render(key, longest[key]).matchAll(/(?:^|\s)(\d) /g),
      ].map((m) => Number(m[1]));
      expect(numbers.length).toBeGreaterThanOrEqual(2);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  test("render refuses a dollar amount", () => {
    expect(() =>
      render("followUp", { restatement: "pay her $120 for the shift" }),
    ).toThrow(/dollar/);
    expect(() =>
      render("followUp", { restatement: "pay her 120 dollars for the shift" }),
    ).toThrow(/dollar/);
    expect(() =>
      render("followUp", { restatement: "120.00 USD for the shift" }),
    ).toThrow(/dollar/);
  });

  test("render refuses text over the limit", () => {
    expect(() =>
      render("followUp", { restatement: "x".repeat(MAX_LEN) }),
    ).toThrow(/240/);
  });

  test("render refuses a missing placeholder", () => {
    expect(() =>
      render("overlap", { who: "Casey", date: "Wed Oct 22", a: "7:30-15:30" }),
    ).toThrow(/\{b\}/);
  });

  test("texts go to the manager and employee; only the two undecided templates name the owner", () => {
    expect(audience.managerPage).toBe("manager");
    expect(audience.entryNoJob).toBe("employee");
    expect(audience.overlap).toBe("employee");
    expect(audience.expenseNoJob).toBe("manager");
    expect(keys.filter((k) => audience[k] === "owner").sort()).toEqual([
      "ownerPage",
      "venmoRate",
    ]);
  });
});

describe("STOP and the one bounded follow-up", () => {
  test("STOP alone, any case, is a stop; STOP inside a sentence is not", () => {
    for (const text of ["STOP", "stop", " Stop "])
      expect(isStop(text)).toBe(true);
    for (const text of ["don't stop", "stop the timer at 4", ""])
      expect(isStop(text)).toBe(false);
  });

  test("a clear, confident reply is applied", () => {
    expect(nextStep({ kind: "confirm", confidence: 0.95 }, 0)).toBe("apply");
    expect(nextStep({ kind: "fixed_in_source", confidence: 0.8 }, 1)).toBe(
      "apply",
    );
  });

  test("an unclear reply gets exactly one follow-up, then the item is held", () => {
    expect(MAX_FOLLOW_UPS).toBe(1);
    expect(nextStep({ kind: "ambiguous", confidence: 0.9 }, 0)).toBe(
      "follow_up",
    );
    expect(nextStep({ kind: "change", confidence: 0.6 }, 0)).toBe("follow_up");
    expect(nextStep({ kind: "ambiguous", confidence: 0.9 }, 1)).toBe("hold");
    expect(nextStep({ kind: "change", confidence: 0.6 }, 1)).toBe("hold");
  });

  test("stop and escalate are never followed up", () => {
    expect(nextStep({ kind: "stop", confidence: 1 }, 0)).toBe("stop");
    expect(nextStep({ kind: "escalate", confidence: 0.5 }, 0)).toBe("escalate");
  });
});

describe("option numbering is 0-based, as in the contract", () => {
  const overlapOptions = [
    "7:00-15:30 Job 102",
    "12:00-16:00 Job 102",
    "both, different jobs",
    "neither",
  ];

  test('a reply of "1" is optionIndex 0, "4" is 3', () => {
    expect(optionIndexFromReply("1", 4)).toBe(0);
    expect(optionIndexFromReply(" 2. ", 4)).toBe(1);
    expect(optionIndexFromReply("4", 4)).toBe(3);
    expect(optionNumber(0)).toBe(1);
  });

  test("numbers outside the options, or anything but a bare number, give null", () => {
    for (const [text, count] of [
      ["0", 4],
      ["5", 4],
      ["3", 2],
      ["1 and 2", 4],
      ["Job 102", 4],
      ["", 4],
    ] as const) {
      expect(optionIndexFromReply(text, count)).toBeNull();
    }
  });

  test("the number in the text and the 0-based index point at the same option", () => {
    const text = render("overlap", {
      who: "Sam",
      date: "Wed Oct 14",
      a: overlapOptions[0] as string,
      b: overlapOptions[1] as string,
    });
    expect(text).toContain(numberedOptions(overlapOptions));
    const index = optionIndexFromReply("2", overlapOptions.length);
    expect(index).toBe(1);
    expect(overlapOptions[index as number]).toBe("12:00-16:00 Job 102");
  });

  test("the index fits the contract's InterpretationOutput (0 to 3, values as pairs)", () => {
    const output = (optionIndex: number | null) => ({
      kind: "confirm",
      optionIndex,
      values: [{ key: "jobId", value: "a-j04" }],
      confidence: 1,
      needsFollowUp: false,
      followUpText: null,
    });
    expect(
      InterpretationOutput.parse(output(optionIndexFromReply("1", 4))),
    ).toMatchObject({ optionIndex: 0 });
    expect(
      InterpretationOutput.parse(output(optionIndexFromReply("4", 4))),
    ).toMatchObject({ optionIndex: 3 });
    expect(() => InterpretationOutput.parse(output(4))).toThrow();
  });

  test("nextStep handles every kind the contract defines", () => {
    const steps = new Set(["apply", "follow_up", "hold", "stop", "escalate"]);
    for (const kind of InterpretationKind.options) {
      expect(steps.has(nextStep({ kind, confidence: 0.9 }, 0))).toBe(true);
    }
  });
});
