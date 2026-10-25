// Coarse categories for free text (expense items and details, job titles, QBO descriptions, Venmo notes).
// The text itself is dropped at read time; only the category travels. Order matters: first match wins.

export type Category =
  | "labor"
  | "fuel"
  | "mulch"
  | "seed"
  | "soil"
  | "plants"
  | "weed"
  | "rental"
  | "equipment"
  | "disposal"
  | "materials"
  | "other";

/** "8 hours x $25", "6h at $30": a person's hours paid as an expense, not a material cost. */
export const LABOR_PATTERN = /\d+(\.\d+)?\s*(h|hrs?|hours?)\b\s*(x|at|@)\s*\$/i;

const RULES: [Category, RegExp][] = [
  ["fuel", /\b(fuel|gas(oline)?|diesel|shell|exxon|mobil|sunoco|wawa)\b/i],
  ["mulch", /\bmulch\b/i],
  ["seed", /\b(seed|seeding|overseed)\b/i],
  ["soil", /\b(soil|topsoil|compost|dirt|loam)\b/i],
  ["plants", /\b(plants?|shrubs?|trees?|flowers?|perennials?|annuals?|sod)\b/i],
  ["weed", /\b(weed|herbicide|round\s?up|pre-?emergent)\b/i],
  ["rental", /\b(rental|rent(ed)?|lease)\b/i],
  [
    "equipment",
    /\b(equipment|mower|trimmer|blower|blade|parts?|repair|tool|chainsaw)\b/i,
  ],
  [
    "disposal",
    /\b(off-?site|disposal|dump|transfer station|haul(ing)?(?! truck)|landfill)\b/i,
  ],
  [
    "materials",
    /\b(materials?|stone|gravel|pavers?|edging|fabric|stakes?|supplies)\b/i,
  ],
];

/** Category of one or more free-text fields; null when all are empty. */
export function categoryOf(
  ...texts: (string | null | undefined)[]
): Category | null {
  const t = texts.filter((s) => s?.trim()).join(" ");
  if (!t) return null;
  if (LABOR_PATTERN.test(t)) return "labor";
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  return "other";
}

/** "#527", "527", "Job #527" -> 527; anything else -> null. */
export function jobNumberOf(v: string | null | undefined): number | null {
  const m = /^\s*(?:job\s*)?#?\s*(\d+)\s*$/i.exec(v ?? "");
  return m ? Number(m[1]) : null;
}

/** Money with spaces, signs and $: "- $55.71", "+ $250.00", "$5,310.49", "(12.00)". */
export function looseMoney(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.replace(/\s+/g, "");
  return s === "" ? null : s;
}

const MONTH = /^(?:\w+,\s*)?[A-Za-z]{3}[a-z]*\.?\s+\d{1,2},?\s+\d{4}/;
const US = /^\d{1,2}\/\d{1,2}\/(\d{4}|\d{2})/;
const ISO = /^\d{4}-\d{2}-\d{2}/;
/** The date part of a date or date-time string ("Sep 21, 2026 10:00 AM", "09/21/2026 5:00pm", ISO). */
export function datePart(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return MONTH.exec(s)?.[0] ?? US.exec(s)?.[0] ?? ISO.exec(s)?.[0] ?? null;
}
