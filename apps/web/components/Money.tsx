// Owner views only. Never pass cents into manager or employee components.
const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function Money({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  return <span className={className}>{fmt.format(cents / 100)}</span>;
}
