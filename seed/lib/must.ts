// Small guards used instead of non-null assertions: a missing value is a bug in the config or the
// fixtures, so it fails loudly with a name instead of flowing on as undefined.

export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

/** The record stored under `key`, created empty on first use (replaces `(o[key] ??= {})`). */
export function bucket<V>(
  o: Partial<Record<string, Record<string, V>>>,
  key: string,
): Record<string, V> {
  let b = o[key];
  if (!b) {
    b = {};
    o[key] = b;
  }
  return b;
}
