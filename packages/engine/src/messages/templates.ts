import type { CheckId, Interpretation } from "@payrollpilot/engine/schemas";
import { PRODUCT_NAME } from "./brand";

// ── Manager summary: edit wording here ─────────────────────────────────────────────────────────────────
// The text a manager gets before payroll. {issue} is the most common flag type this cycle, from issuePhrases.
// "one" is used when a single item needs them. The "Details here" line is left out when DASHBOARD_URL is not set.
export const managerSummaryWording = {
  many: "Hi {name}, before we run payroll ({range}) there are {count} timesheet items to check, mostly {issue}.",
  one: "Hi {name}, before we run payroll ({range}) there is 1 timesheet item to check, about {issue}.",
  link: "\nDetails here: {link}",
} as const;

// Every flag type in plain English: "many" follows "mostly", "one" follows "about".
export const issuePhrases: Record<CheckId, { one: string; many: string }> = {
  "CHK-01": {
    one: "hours logged without a job",
    many: "hours logged without a job",
  },
  "CHK-02": { one: "a timer left running", many: "timers left running" },
  "CHK-03": { one: "an unusually long shift", many: "unusually long shifts" },
  "CHK-04": { one: "two entries that overlap", many: "entries that overlap" },
  "CHK-05": {
    one: "a duplicate or zero-hour entry",
    many: "duplicate or zero-hour entries",
  },
  "CHK-06": {
    one: "hours not approved by the cutoff",
    many: "hours not approved by the cutoff",
  },
  "CHK-07": {
    one: "a worker with no hours logged",
    many: "workers with no hours logged",
  },
  "CHK-08": {
    one: "an inactive worker with hours",
    many: "inactive workers with hours",
  },
  "CHK-09": {
    one: "a worker not set up in Gusto",
    many: "workers not set up in Gusto",
  },
  "CHK-10": {
    one: "a pay rate that differs between systems",
    many: "pay rates that differ between systems",
  },
  "CHK-11": {
    one: "a contractor with no rate on file",
    many: "contractors with no rate on file",
  },
  "CHK-12": {
    one: "someone paid outside the payroll sync",
    many: "people paid outside the payroll sync",
  },
  "CHK-13": {
    one: "a job with no labor recorded",
    many: "jobs with no labor recorded",
  },
  "CHK-14": { one: "a purchase with no job", many: "purchases with no job" },
  "CHK-15": {
    one: "a purchase that may be counted twice",
    many: "purchases that may be counted twice",
  },
  "CHK-16": {
    one: "a disposal fee not linked to its job",
    many: "disposal fees not linked to their jobs",
  },
  "CHK-17": {
    one: "a purchase not sorted as job cost or overhead",
    many: "purchases not sorted as job cost or overhead",
  },
  "CHK-18": {
    one: "an old rate used for labor",
    many: "old rates used for labor",
  },
  "CHK-19": {
    one: "a deposit counted as a final payment",
    many: "deposits counted as final payments",
  },
  "CHK-20": {
    one: "a quote credited to the wrong person",
    many: "quotes credited to the wrong person",
  },
  "CHK-21": { one: "a job with low profit", many: "jobs with low profit" },
  "CHK-22": {
    one: "pay that changed more than usual",
    many: "pay that changed more than usual",
  },
  "CHK-23": { one: "an incomplete data pull", many: "incomplete data pulls" },
};

// ── End-time question: edit wording here ───────────────────────────────────────────────────────────────
// Asked when a worker's reply to the long-shift question says it "ended earlier" or that they "forgot to clock out".
// {date} is the day the shift started, in the company's timezone, from friendlyDate() below ("Wed Oct 14").
// It asks for a time, not a choice, so there are no numbered options.
export const endTimeWording =
  "{who}, what time did you stop on {date}? Reply the time, e.g. 4:30pm";
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

// Text templates for every message (C-03); the product name comes from brand.ts. One short question per text, numbered options,
// never a dollar amount, at most MAX_LEN characters. Placeholders are in braces.
export const templates = {
  managerPage: `${PRODUCT_NAME}: {n} items need you before {day}'s payroll. Open: {link}`,
  ownerPage: `${PRODUCT_NAME}: {n} decisions are waiting for you before {day}'s payroll. Open: {link}`,
  // Filled by managerSummary() in summary.ts; wording lives in managerSummaryWording above.
  managerSummary: `${managerSummaryWording.many}${managerSummaryWording.link}`,
  managerSummaryNoLink: managerSummaryWording.many,
  managerSummaryOne: `${managerSummaryWording.one}${managerSummaryWording.link}`,
  managerSummaryOneNoLink: managerSummaryWording.one,
  entryNoJob:
    "{who}, on {date} your {hours}h entry has no job. Which job was it? 1 {jobA} 2 {jobB} 3 something else",
  overlap:
    "{who}, on {date} two entries overlap ({a} and {b}). Which one is right? 1 {a} 2 {b} 3 both, different jobs 4 neither",
  openTimer:
    "{who}, your timer from {date} {start} is still running. When did you stop? Reply the time, e.g. 4:30pm",
  longShift:
    "{who}, {date} shows a {hours}h shift. Is that right? 1 yes 2 no, it ended earlier 3 forgot to clock out",
  // Follow-up to longShift options 2 and 3. Wording lives in endTimeWording at the top of this file.
  endTime: endTimeWording,
  expenseNoJob:
    "{who}, a {vendor} purchase on {date} has no job. Which job? 1 {jobA} 2 {jobB} 3 overhead 4 not sure",
  venmoRate: `Which rate should ${PRODUCT_NAME} use for {who}? Reply the hourly rate as a number.`,
  followUp: "Thanks. To confirm: {restatement}. Reply 1 yes, 2 no",
  held: "Got it. That item stays on hold until {day}; the rest of {who}'s hours go through.",
  stopAck: `You won't get texts from ${PRODUCT_NAME}. Questions will go to your manager.`,
} as const;

export type TemplateKey = keyof typeof templates;

// Who each template is texted to. The owner works in the dashboard; ownerPage and venmoRate stay as planned
// until the team decides whether the owner gets texts at all. "recipient" means whoever is answering.
export const audience: Record<
  TemplateKey,
  "manager" | "employee" | "owner" | "recipient"
> = {
  managerPage: "manager",
  managerSummary: "manager",
  managerSummaryNoLink: "manager",
  managerSummaryOne: "manager",
  managerSummaryOneNoLink: "manager",
  ownerPage: "owner",
  entryNoJob: "employee",
  overlap: "employee",
  openTimer: "employee",
  longShift: "employee",
  endTime: "employee",
  expenseNoJob: "manager",
  venmoRate: "owner",
  followUp: "recipient",
  held: "recipient",
  stopAck: "recipient",
};

export const MAX_LEN = 240;

const DOLLAR_AMOUNT = /\$|\b\d[\d,]*(\.\d+)?\s*(dollars?|usd|bucks)\b/i;

// "Wed Oct 14": the day an entry started, in the company's own timezone (not the server's, and not UTC, which can be
// a different day for an evening shift). Use it for {date}: render("endTime", { who, date: friendlyDate(entry.startAt,
// company.timezone) }). Built from Intl's parts, so the words and spaces never depend on the runtime's locale glue.
// Throws on a value that is not a date or a timezone that does not exist, rather than texting a wrong day.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

export function friendlyDate(iso: string, timezone: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime()))
    throw new Error(`friendlyDate: not a date: ${iso}`);
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    });
    dayFormatters.set(timezone, formatter);
  }
  const part: Record<string, string> = {};
  for (const p of formatter.formatToParts(when)) part[p.type] = p.value;
  return `${part.weekday} ${part.month} ${part.day}`;
}

// Placeholders filled in, with no checks; render() is what goes to a phone.
export function fill(key: TemplateKey, vars: Record<string, string>): string {
  return templates[key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`${key}: missing {${name}}`);
    return value;
  });
}

export function render(key: TemplateKey, vars: Record<string, string>): string {
  const text = fill(key, vars);
  if (DOLLAR_AMOUNT.test(text))
    throw new Error(`${key}: texts never carry a dollar amount`);
  if (text.length > MAX_LEN)
    throw new Error(`${key}: ${text.length} characters, over ${MAX_LEN}`);
  return text;
}

// STOP is decided by code, before any model sees the reply.
export function isStop(text: string): boolean {
  return /^\s*stop\s*$/i.test(text);
}

// Texts number options from 1; the contract's optionIndex is 0-based, so a reply of "1" is index 0.
export const MAX_OPTIONS = 4;

export function optionNumber(optionIndex: number): number {
  return optionIndex + 1;
}

export function numberedOptions(options: readonly string[]): string {
  return options
    .map((option, index) => `${optionNumber(index)} ${option}`)
    .join(" ");
}

// A bare number reply ("2", "2.") becomes its 0-based optionIndex; anything else is left to the Messenger.
export function optionIndexFromReply(
  text: string,
  optionCount: number,
): Interpretation["result"]["optionIndex"] {
  const match = text.match(/^\s*(\d)\s*[.)]?\s*$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < Math.min(optionCount, MAX_OPTIONS)
    ? index
    : null;
}

// One bounded follow-up: an unclear or low-confidence reply gets one followUp text, then the item is held.
export const MAX_FOLLOW_UPS = 1;
export const FOLLOW_UP_BELOW = 0.8;

export type NextStep = "apply" | "follow_up" | "hold" | "stop" | "escalate";

export function nextStep(
  reply: {
    kind: Interpretation["result"]["kind"];
    confidence: Interpretation["confidence"];
  },
  followUpsSent: number,
): NextStep {
  if (reply.kind === "stop") return "stop";
  if (reply.kind === "escalate") return "escalate";
  if (reply.kind === "ambiguous" || reply.confidence < FOLLOW_UP_BELOW) {
    return followUpsSent < MAX_FOLLOW_UPS ? "follow_up" : "hold";
  }
  return "apply";
}
