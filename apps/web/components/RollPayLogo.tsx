import { cn } from "@/lib/utils";

// The wordmark: "RollPay" in the UI sans at semibold, tight tracking, ink only. The one custom glyph is the "ll":
// two equal vertical bars, like ledger columns, a touch taller than the cap height. No space, no colour.
export function RollPayLogo({
  className,
  height = 22,
}: {
  className?: string;
  height?: number;
}) {
  const bar = height * 0.17;
  const barH = height * 0.92;
  return (
    <span
      role="img"
      aria-label="RollPay"
      className={cn(
        "inline-flex items-baseline font-semibold leading-none tracking-[-0.04em] text-foreground select-none",
        className,
      )}
      style={{ fontSize: height }}
    >
      <span>Ro</span>
      <svg
        aria-hidden="true"
        width={bar * 3.6}
        height={barH}
        viewBox={`0 0 ${bar * 3.6} ${barH}`}
        className="mx-[0.03em] translate-y-[0.02em] self-end"
      >
        <rect
          x={bar * 0.4}
          y="0"
          width={bar}
          height={barH}
          rx={bar * 0.18}
          fill="currentColor"
        />
        <rect
          x={bar * 2.2}
          y="0"
          width={bar}
          height={barH}
          rx={bar * 0.18}
          fill="currentColor"
        />
      </svg>
      <span>Pay</span>
    </span>
  );
}

/** Square monogram for the collapsed sidebar and the favicon: ink tile, paper "R" with the ledger bar as its stem. */
export function RollPayMonogram({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      role="img"
      aria-label="RollPay"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <g
        fill="none"
        stroke="var(--background)"
        strokeWidth="3.4"
        strokeLinecap="round"
      >
        <path d="M11 25V7" />
        <path d="M11 7h6.5a5 5 0 0 1 0 10H11" />
        <path d="M17 17l5.5 8" />
      </g>
    </svg>
  );
}
