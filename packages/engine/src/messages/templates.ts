import type { Interpretation } from "@payrollpilot/engine/schemas";

// Text templates for every PayrollPilot message (C-03). One short question per text, numbered options,
// never a dollar amount, at most MAX_LEN characters. Placeholders are in braces.
export const templates = {
  managerPage:
    "PayrollPilot: {n} items need you before {day}'s payroll. Open: {link}",
  ownerPage:
    "PayrollPilot: {n} decisions are waiting for you before {day}'s payroll. Open: {link}",
  entryNoJob:
    "{who}, on {date} your {hours}h entry has no job. Which job was it? 1 {jobA} 2 {jobB} 3 something else",
  overlap:
    "{who}, on {date} two entries overlap ({a} and {b}). Which one is right? 1 {a} 2 {b} 3 both, different jobs 4 neither",
  openTimer:
    "{who}, your timer from {date} {start} is still running. When did you stop? Reply the time, e.g. 4:30pm",
  longShift:
    "{who}, {date} shows a {hours}h shift. Is that right? 1 yes 2 no, it ended earlier 3 forgot to clock out",
  expenseNoJob:
    "{who}, a {vendor} purchase on {date} has no job. Which job? 1 {jobA} 2 {jobB} 3 overhead 4 not sure",
  venmoRate:
    "Which rate should PayrollPilot use for {who}? Reply the hourly rate as a number.",
  followUp: "Thanks. To confirm: {restatement}. Reply 1 yes, 2 no",
  held: "Got it. That item stays on hold until {day}; the rest of {who}'s hours go through.",
  stopAck:
    "You won't get texts from PayrollPilot. Questions will go to your manager.",
} as const;

export type TemplateKey = keyof typeof templates;

// Who each template is texted to. The owner works in the dashboard; ownerPage and venmoRate stay as planned
// until the team decides whether the owner gets texts at all. "recipient" means whoever is answering.
export const audience: Record<
  TemplateKey,
  "manager" | "employee" | "owner" | "recipient"
> = {
  managerPage: "manager",
  ownerPage: "owner",
  entryNoJob: "employee",
  overlap: "employee",
  openTimer: "employee",
  longShift: "employee",
  expenseNoJob: "manager",
  venmoRate: "owner",
  followUp: "recipient",
  held: "recipient",
  stopAck: "recipient",
};

export const MAX_LEN = 240;

const DOLLAR_AMOUNT = /\$|\b\d[\d,]*(\.\d+)?\s*(dollars?|usd|bucks)\b/i;

export function render(key: TemplateKey, vars: Record<string, string>): string {
  const text = templates[key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`${key}: missing {${name}}`);
    return value;
  });
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
