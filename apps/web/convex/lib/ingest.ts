// Fixture ids (w_07, te_14, ...) → Convex ids. Pure, so it is unit tested without a deployment.
// Tables insert in ORDER; references that point forward (jobs ↔ quotes, flags ↔ questions, ...) are written
// as null/[] first and patched once every row exists (DEFER).

export const ORDER = [
  "companies",
  "workers",
  "cycles",
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

/** String fields that hold source-system ids, keys or text: never treated as references. */
const NOT_REFS = new Set([
  "id",
  "sourceId",
  "recordId",
  "providerId",
  "conversationKey",
  "contactRef",
  "userId",
  "approvedBy",
  "answeredBy",
  "text",
  "seen",
  "summary",
  "memo",
  "note",
  "title",
  "name",
  "displayName",
]);

export type Fixture = Partial<Record<Table, Record<string, unknown>[]>>;

/** Replaces every string that is a known fixture id with its Convex id, except under NOT_REFS keys. */
export function remap(
  value: unknown,
  ids: Map<string, string>,
  key = "",
): unknown {
  if (typeof value === "string")
    return !NOT_REFS.has(key) && ids.has(value) ? ids.get(value) : value;
  if (Array.isArray(value)) return value.map((x) => remap(x, ids, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, x]) => [
        k,
        k === "refs" ? remapRefs(x, ids) : remap(x, ids, k),
      ]),
    );
  }
  return value;
}

/** AuditEvent.refs values are ids by definition (record<string, id>). */
function remapRefs(refs: unknown, ids: Map<string, string>) {
  if (!refs || typeof refs !== "object") return refs;
  return Object.fromEntries(
    Object.entries(refs).map(([k, x]) => [
      k,
      typeof x === "string" ? (ids.get(x) ?? x) : x,
    ]),
  );
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
