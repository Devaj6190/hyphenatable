// Fixture ids (w_07, te_14, ...) → Convex ids. Pure, so it is unit tested without a deployment.
// Tables insert in ORDER; references that point forward (jobs ↔ quotes, flags ↔ questions, ...) are written
// as null/[] first and patched once every row exists (DEFER).

export const ORDER = [
  "companies",
  "workers",
  "cycles",
  "pastPayrolls",
  "quotes",
  "jobs",
  "visits",
  "invoices",
  "payments",
  "expenses",
  "timeEntries",
  "syncRuns",
  "rules",
  "lessons",
  "flags",
  "questions",
  "messages",
  "interpretations",
  "corrections",
  "drafts",
  "auditEvents",
  "accessEvents",
] as const;
export type Table = (typeof ORDER)[number];

/** Dotted paths written empty in the first pass and patched in the second. */
export const DEFER: Partial<Record<Table, string[]>> = {
  workers: ["managerId"],
  quotes: ["jobId"],
  jobs: ["parentJobId"],
  rules: ["provenance.lessonId", "provenance.flagId"],
  lessons: [
    "relatedLessonIds",
    "createdFrom.flagId",
    "createdFrom.questionId",
    "createdFrom.messageId",
  ],
  flags: ["questionId", "correctionId", "precedent.flagId"],
  questions: ["interpretationId"],
};

/** Keys that end in Id/Ids/By but hold upstream or provider values, not our records. */
const SOURCE_KEYS = new Set(["sourceId", "recordId", "providerId", "checkId"]);

/**
 * Whether a string under `key` (inside `parent`) is a reference to one of our records.
 * Allowlist, so free text that happens to equal an id ("a") is never rewritten:
 * `*Id`, `*Ids`, `*By` (approvedBy, answeredBy: user ids are worker ids), userId,
 * Rule.provenance.evidence, Correction.target.id / before / after and every AuditEvent.refs value.
 */
function isRef(key: string, parent: string): boolean {
  if (parent === "refs" || key === "evidence" || key === "userId") return true;
  // Correction.before/after hold a record id when the corrected field is a reference (e.g. jobId).
  if (key === "before" || key === "after") return true;
  if (parent === "target" && key === "id") return true;
  return /(Id|Ids|By)$/.test(key) && !SOURCE_KEYS.has(key);
}

export type Fixture = Partial<Record<Table, Record<string, unknown>[]>>;

/** Replaces known fixture ids with Convex ids wherever `isRef` says the field is a reference. */
export function remap(
  value: unknown,
  ids: Map<string, string>,
  key = "",
  parent = "",
): unknown {
  if (typeof value === "string")
    return isRef(key, parent) && ids.has(value) ? ids.get(value) : value;
  if (Array.isArray(value)) return value.map((x) => remap(x, ids, key, parent));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, x]) => [k, remap(x, ids, k, key)]),
    );
  }
  return value;
}

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], obj);
}

/** Returns a copy with `path` set to `value`; missing parents are left alone (a null precedent stays null). */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (!rest.length) return { ...obj, [head]: value };
  const child = obj[head];
  if (!child || typeof child !== "object") return obj;
  return {
    ...obj,
    [head]: setPath(child as Record<string, unknown>, rest.join("."), value),
  };
}

/** First-pass copy: drop `id`, empty the deferred paths. */
export function firstPass(table: Table, row: Record<string, unknown>) {
  const { id: _id, ...rest } = row;
  return (DEFER[table] ?? []).reduce(
    (r, p) =>
      getPath(r, p) === undefined
        ? r
        : setPath(r, p, Array.isArray(getPath(r, p)) ? [] : null),
    rest as Record<string, unknown>,
  );
}
