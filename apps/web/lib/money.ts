const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Integer cents → "$1,284.50". `signed` adds "+" to positives; negatives always use a true minus "−". */
export function formatCents(cents: number, signed = false): string {
  // Money is integer cents everywhere; a fraction means a bug upstream, so fail loudly instead of rounding.
  if (!Number.isInteger(cents))
    throw new RangeError(`formatCents expects integer cents, got ${cents}`);
  const sign = cents < 0 ? "−" : signed && cents > 0 ? "+" : "";
  return sign + fmt.format(Math.abs(cents) / 100);
}
