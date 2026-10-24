// Adopting hand-entered Jobber time entries (Jobber has no time-entry create mutation for apps).
// A person enters a few planted entries in the Jobber UI; `push-jobber.ts --live --adopt-entries` reads
// the account's time entries (read only) and writes their Jobber ids into the id map, so the pull can
// match them to our fixture ids. Matching is exact and never guesses.

import type { IdMap, Rec } from "./jobber-mutations";

/** The entries the morning checklist asks for: the CHK-04 overlap pair (and, optionally, the CHK-02 timer). */
export const DEFAULT_ADOPT_IDS = ["a-te-0111", "a-te-0113", "a-te-0140"];

export type JobberEntry = {
  id: string;
  startAt: string;
  ticking: boolean;
  user: { id: string } | null;
  job: { id: string } | null;
};

export type AdoptResult = {
  adopted: Record<string, { jobberId: string; matchedBy: string }>;
  notFound: string[];
  ambiguous: Record<string, string[]>;
};

const MINUTE = 60_000;

/**
 * For each fixture entry: the Jobber entry with the same user and job, and
 *  - a closed entry: a start time within one minute of the fixture's (entered by hand to the minute);
 *  - a ticking entry (open timer): ticking=true. A timer cannot be back-dated, so its start is not compared.
 * Zero matches -> notFound; more than one -> ambiguous (nothing written for it); already-adopted Jobber ids are not reused.
 */
export function matchEntries(
  fixtureEntries: Rec[],
  jobber: JobberEntry[],
  map: IdMap,
  ids: string[],
): AdoptResult {
  const result: AdoptResult = { adopted: {}, notFound: [], ambiguous: {} };
  // Jobber id -> our id it is already mapped to (rerunning adopt for the same entry is fine)
  const taken = new Map(
    Object.entries(map.entries ?? {}).map(([ours, jid]) => [jid, ours]),
  );
  for (const ourId of ids) {
    const e = fixtureEntries.find((x) => x.id === ourId);
    if (!e) throw new Error(`no fixture entry ${ourId}`);
    const userId = map.users?.[e.workerId as string];
    const jobId = e.jobId ? map.jobs?.[e.jobId as string] : null;
    if (!userId)
      throw new Error(
        `${ourId}: worker ${e.workerId} has no Jobber user in the map (run --live once first)`,
      );
    if (e.jobId && !jobId)
      throw new Error(
        `${ourId}: job ${e.jobId} has no Jobber id in the map (run --live first)`,
      );
    const candidates = jobber.filter(
      (j) =>
        (taken.get(j.id) ?? ourId) === ourId &&
        j.user?.id === userId &&
        (j.job?.id ?? null) === (jobId ?? null) &&
        (e.ticking
          ? j.ticking
          : !j.ticking &&
            Math.abs(Date.parse(j.startAt) - Date.parse(e.startAt as string)) <
              MINUTE),
    );
    if (candidates.length === 0) result.notFound.push(ourId);
    else if (candidates.length > 1)
      result.ambiguous[ourId] = candidates.map((c) => c.id);
    else {
      result.adopted[ourId] = {
        jobberId: candidates[0].id,
        matchedBy: e.ticking ? "user+job+ticking" : "user+job+startAt",
      };
      taken.set(candidates[0].id, ourId);
    }
  }
  return result;
}
