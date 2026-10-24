// Completeness checks: every pull records pulled vs expected; any mismatch -> complete = false
// with the difference spelled out in `error` (ids only, never names). CHK-23 reads these.

export interface CompletenessResult {
  pulled: number;
  expected: number | null;
  complete: boolean;
  error: string | null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** nodes.length vs the connection's totalCount (and totalCount stable across pages). */
export function connectionCompleteness(object: string, pulled: number, totalCount: number, totalCountDrift = false): CompletenessResult {
  const problems: string[] = [];
  if (pulled !== totalCount) problems.push(`${object}: pulled ${pulled}, totalCount ${totalCount} (diff ${signed(pulled - totalCount)})`);
  if (totalCountDrift) problems.push(`${object}: totalCount changed between pages`);
  return { pulled, expected: totalCount, complete: problems.length === 0, error: problems.length ? problems.join("; ") : null };
}

export interface TimeEntryCompletenessInput {
  /** Jobber user id per pulled entry (null when the entry has no user). */
  entryUserIds: (string | null)[];
  totalCount: number;
  totalCountDrift?: boolean;
  /** Sum of TimeSheetUserDay.entries.totalCount over the period, per Jobber user id. */
  byDayCountPerUser: Map<string, number>;
}

/**
 * Time entries get two independent counts: the connection's totalCount, and the per-user
 * User.timeSheetsByDay totals. Either mismatch makes the run incomplete. Entries without a user
 * cannot appear in a per-user total, so they are compared against totalCount only and reported.
 */
export function timeEntryCompleteness(input: TimeEntryCompletenessInput): CompletenessResult {
  const pulled = input.entryUserIds.length;
  const base = connectionCompleteness("timeSheetEntries", pulled, input.totalCount, input.totalCountDrift);
  const problems = base.error ? [base.error] : [];

  const pulledPerUser = new Map<string, number>();
  let noUser = 0;
  for (const u of input.entryUserIds) {
    if (u === null) noUser++;
    else pulledPerUser.set(u, (pulledPerUser.get(u) ?? 0) + 1);
  }
  let byDaySum = 0;
  for (const n of input.byDayCountPerUser.values()) byDaySum += n;
  const withUser = pulled - noUser;
  if (withUser !== byDaySum) {
    problems.push(`timeSheetEntries: pulled ${withUser} with a user, timeSheetsByDay sum ${byDaySum} (diff ${signed(withUser - byDaySum)})`);
  }
  const users = new Set([...pulledPerUser.keys(), ...input.byDayCountPerUser.keys()]);
  const perUser: string[] = [];
  for (const u of [...users].sort()) {
    const p = pulledPerUser.get(u) ?? 0;
    const d = input.byDayCountPerUser.get(u);
    if (d === undefined) perUser.push(`${u} pulled ${p}, no timeSheetsByDay total (user not in users pull)`);
    else if (p !== d) perUser.push(`${u} pulled ${p} vs timeSheetsByDay ${d}`);
  }
  if (perUser.length) problems.push(`per user: ${perUser.join(", ")}`);
  if (noUser > 0) problems.push(`note: ${noUser} entries have no user`);

  const failing = problems.filter((p) => !p.startsWith("note:"));
  return {
    pulled,
    expected: input.totalCount,
    complete: failing.length === 0,
    error: failing.length ? problems.join("; ") : null,
  };
}
