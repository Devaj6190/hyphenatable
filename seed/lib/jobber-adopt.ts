// Adopting hand-entered Jobber time entries (Jobber has no time-entry create mutation for apps).
// A person enters planted entries in the Jobber UI; `push-jobber.ts --live --adopt-entries` reads the
// account's time entries (read only) and writes their Jobber ids into the id map, so the pull can match
// them to our fixture ids. Matching is exact and never guesses.

import type { IdMap, Rec } from "./jobber-mutations";

/**
 * The entries the morning checklist asks for (any fixture entry can be passed with --ids):
 * CHK-04 overlap pair, CHK-02 timer (optional), CHK-01 no job, CHK-03 13 h, CHK-05 zero minutes,
 * CHK-05 exact duplicate pair, CHK-06 unapproved.
 */
export const DEFAULT_ADOPT_IDS = [
  "a-te-0111",
  "a-te-0113",
  "a-te-0140",
  "a-te-0121",
  "a-te-0130",
  "a-te-0137",
  "a-te-0106",
  "a-te-0146",
  "a-te-0183",
  "a-te-0184",
  "a-te-0185",
];

export type JobberEntry = {
  id: string;
  startAt: string;
  ticking: boolean;
  user: { id: string } | null;
  job: { id: string } | null;
  createdAt?: string | null;
  finalDuration?: number | null;
  timeSheetCategory?: string | null;
};

export type AdoptResult = {
  adopted: Record<string, { jobberId: string; matchedBy: string }>;
  notFound: string[];
  ambiguous: Record<string, string[]>;
};

const MINUTE = 60_000;

/**
 * Each fixture entry matches a Jobber entry with the same user and the same job (or no job, with category
 * GENERAL when Jobber reports one), and
 *  - closed: start within one minute and duration within one minute (a zero-minute entry is duration 0);
 *  - ticking (open timer): ticking=true; its start is not compared (a timer cannot be back-dated).
 * Fixture entries that are exact duplicates of each other (same user, job, start, duration; e.g. the CHK-05
 * pair) are matched as a group: the group needs exactly as many Jobber candidates, assigned in order of
 * Jobber creation (createdAt, then id) to the fixture ids in id order; existing mappings are kept.
 * Fewer candidates -> notFound; more -> ambiguous; nothing is written for either. A Jobber id mapped to a
 * fixture entry outside the group is never reused.
 */
export function matchEntries(
  fixtureEntries: Rec[],
  jobber: JobberEntry[],
  map: IdMap,
  ids: string[],
): AdoptResult {
  const result: AdoptResult = { adopted: {}, notFound: [], ambiguous: {} };
  const taken = new Map(
    Object.entries(map.entries ?? {}).map(([ours, jid]) => [jid, ours]),
  );
  const resolved = [...new Set(ids)].map((ourId) => {
    const e = fixtureEntries.find((x) => x.id === ourId);
    if (!e) throw new Error(`no fixture entry ${ourId}`);
    const userId = map.users?.[e.workerId as string];
    if (!userId)
      throw new Error(
        `${ourId}: worker ${e.workerId} has no Jobber user in the map (run --live once first)`,
      );
    const jobId = e.jobId ? map.jobs?.[e.jobId as string] : null;
    if (e.jobId && !jobId)
      throw new Error(
        `${ourId}: job ${e.jobId} has no Jobber id in the map (run --live first)`,
      );
    const signature = JSON.stringify([
      e.workerId,
      e.jobId,
      e.ticking,
      e.ticking ? null : e.startAt,
      e.ticking ? null : e.durationSec,
      e.category,
    ]);
    return { ourId, e, userId, jobId: jobId ?? null, signature };
  });
  const groups = new Map<string, typeof resolved>();
  for (const r of resolved)
    groups.set(r.signature, [...(groups.get(r.signature) ?? []), r]);

  for (const group of groups.values()) {
    group.sort((a, b) => a.ourId.localeCompare(b.ourId));
    const { e, userId, jobId } = group[0];
    const members = new Set(group.map((g) => g.ourId));
    const fits = (j: JobberEntry) => {
      const owner = taken.get(j.id);
      if (owner && !members.has(owner)) return false;
      if (j.user?.id !== userId || (j.job?.id ?? null) !== jobId) return false;
      if (
        !jobId &&
        j.timeSheetCategory &&
        j.timeSheetCategory.toUpperCase() !== String(e.category).toUpperCase()
      )
        return false;
      if (e.ticking) return j.ticking;
      if (j.ticking) return false;
      if (
        Math.abs(Date.parse(j.startAt) - Date.parse(e.startAt as string)) >=
        MINUTE
      )
        return false;
      return (
        j.finalDuration == null ||
        Math.abs(j.finalDuration - (e.durationSec as number)) < 60
      );
    };
    const candidates = jobber
      .filter(fits)
      .sort(
        (a, b) =>
          String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
          a.id.localeCompare(b.id),
      );
    const ourIds = group.map((g) => g.ourId);
    if (candidates.length < group.length) {
      result.notFound.push(...ourIds);
      continue;
    }
    if (candidates.length > group.length) {
      for (const id of ourIds)
        result.ambiguous[id] = candidates.map((c) => c.id);
      continue;
    }
    // keep existing mappings, then assign the rest in creation order
    const free = candidates.filter((c) => !members.has(taken.get(c.id) ?? ""));
    for (const id of ourIds) {
      const kept = candidates.find((c) => taken.get(c.id) === id);
      const pick = kept ?? free.shift();
      if (!pick) {
        result.notFound.push(id);
        continue;
      }
      const how = e.ticking
        ? "user+job+ticking"
        : `user+${jobId ? "job" : "no-job"}+startAt+duration${group.length > 1 ? "+creationOrder" : ""}`;
      result.adopted[id] = { jobberId: pick.id, matchedBy: how };
      taken.set(pick.id, id);
    }
  }
  return result;
}
