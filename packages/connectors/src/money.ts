// Decimal amounts -> scaled integers without float arithmetic.
// Sources send money as JSON numbers (Jobber, Gusto) or decimal strings (QBO, exports).
// A JSON number is first turned back into its shortest decimal string (String(n) round-trips
// the literal the server sent), then parsed digit by digit. Half-up (away from zero) at the
// first dropped decimal. Missing -> null. Malformed -> throws (never a silent 0).

/** value x 10^decimals as an integer, e.g. parseScaled("8.25", 2) = 825. */
export function parseScaled(value: number | string | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined) return null;
  let s: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`parseScaled: not a finite number: ${value}`);
    s = String(value);
    if (/e/i.test(s)) s = value.toFixed(12);
  } else {
    s = value.trim().replace(/[$,]/g, "");
    if (s === "") return null;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren?.[1] !== undefined) s = `-${paren[1]}`;
  }
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`parseScaled: not a decimal amount: ${JSON.stringify(value)}`);
  const negative = m[1] === "-";
  const whole = m[2] === "" ? 0 : Number(m[2]);
  const frac = (m[3] ?? "").padEnd(decimals + 1, "0");
  let n = whole * 10 ** decimals + (decimals ? Number(frac.slice(0, decimals)) : 0);
  if (Number(frac[decimals]) >= 5) n += 1;
  if (!Number.isSafeInteger(n)) throw new Error(`parseScaled: amount out of range: ${JSON.stringify(value)}`);
  return negative && n !== 0 ? -n : n;
}

/** Decimal dollars -> integer cents. */
export const toCents = (value: number | string | null | undefined): number | null => parseScaled(value, 2);
