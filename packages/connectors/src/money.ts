// Decimal dollars -> integer cents without float arithmetic.
// Sources send money as JSON numbers (Jobber, Gusto) or decimal strings (QBO, exports).
// A JSON number is first turned back into its shortest decimal string (String(n) round-trips
// the literal the server sent), then parsed digit by digit. Half-up (away from zero) at the
// third decimal. Missing -> null. Malformed -> throws (never a silent 0).

export function toCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let s: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`toCents: not a finite number: ${value}`);
    s = String(value);
    if (/e/i.test(s)) s = value.toFixed(12);
  } else {
    s = value.trim().replace(/[$,]/g, "");
    if (s === "") return null;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren?.[1] !== undefined) s = `-${paren[1]}`;
  }
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`toCents: not a decimal amount: ${JSON.stringify(value)}`);
  const negative = m[1] === "-";
  const whole = m[2] === "" ? 0 : Number(m[2]);
  const frac = (m[3] ?? "").padEnd(3, "0");
  let cents = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new Error(`toCents: amount out of range: ${JSON.stringify(value)}`);
  return negative && cents !== 0 ? -cents : cents;
}
