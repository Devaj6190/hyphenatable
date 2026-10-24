// Integer money. Every amount is computed from unrounded seconds and rounded half-up exactly once.

/** round(num / den) half-up, for non-negative integers. */
export function divHalfUp(num: number, den: number): number {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0)
    throw new Error(`divHalfUp: bad operands ${num}/${den}`);
  if (num < 0) throw new Error(`divHalfUp: negative ${num}`);
  return Math.floor((2 * num + den) / (2 * den));
}

/** A multiplier like 1.5 as an exact fraction over 100. */
function multiplierHundredths(multiplier: number): number {
  const h = Math.round(multiplier * 100);
  if (Math.abs(h - multiplier * 100) > 1e-9)
    throw new Error(`multiplier ${multiplier} is not a whole hundredth`);
  return h;
}

/** Cents for `seconds` worked at `rateCents` per hour times `multiplier`, rounded half-up once. */
export function centsFor(
  seconds: number,
  rateCents: number,
  multiplier = 1,
): number {
  return divHalfUp(
    seconds * rateCents * multiplierHundredths(multiplier),
    3600 * 100,
  );
}

/** Hours to 0.01, half-up. Used only for the Gusto line and display, never for money. */
export function hours2(seconds: number): number {
  return divHalfUp(seconds * 100, 3600) / 100;
}

/** "42.50" */
export const fmtH = (seconds: number) => hours2(seconds).toFixed(2);
