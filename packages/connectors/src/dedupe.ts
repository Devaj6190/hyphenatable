// Overlapping exports (two Timesheets files whose date ranges overlap, two Invoices reports, ...) carry the
// same entries twice. Across files an entry an earlier file already had is dropped (the earlier file's row,
// and so its sourceId, is kept). Within one file nothing is dropped: two identical rows in one export are a
// real flag. Counting is per key: a later file keeps the copies beyond the most any earlier file had.

import type { SyncRun } from "./types.ts";

export class CrossFileDedupe<R> {
  private readonly earlier = new Map<string, number>();
  constructor(private readonly keyOf: (row: R) => string) {}

  /** The next file's rows minus entries an earlier file already had. */
  take(rows: R[]): { rows: R[]; dropped: number } {
    const counts = new Map<string, number>();
    const used = new Map<string, number>();
    const kept: R[] = [];
    let dropped = 0;
    for (const r of rows) {
      const k = this.keyOf(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      const u = used.get(k) ?? 0;
      if (u < (this.earlier.get(k) ?? 0)) {
        used.set(k, u + 1);
        dropped++;
      } else kept.push(r);
    }
    for (const [k, n] of counts)
      this.earlier.set(k, Math.max(this.earlier.get(k) ?? 0, n));
    return { rows: kept, dropped };
  }
}

/** Adds the drop count to the file's SyncRun as a note (a note does not make the run incomplete). */
export function noteDuplicates(run: SyncRun, dropped: number): SyncRun {
  if (!dropped) return run;
  const note = `note: ${dropped} duplicate entries across overlapping exports`;
  return { ...run, error: run.error ? `${run.error}; ${note}` : note };
}
