import Image from "next/image";
import { cn } from "@/lib/utils";

// Brand art from public/brand. SVGs are served as-is (unoptimized), and theme pairs swap on the `dark` variant.

/** RollPay wordmark: sunset on light, the dark-theme file on dark. */
export function RollPayLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/brand/rollpay-logo-sunset.svg"
        alt="RollPay"
        width={644}
        height={213}
        unoptimized
        priority
        className="h-full w-auto dark:hidden"
      />
      <Image
        src="/brand/rollpay-logo-dark.svg"
        alt="RollPay"
        width={644}
        height={213}
        unoptimized
        priority
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}

export type IntegrationSystem = "Jobber" | "Gusto" | "QuickBooks";

const SQUARE = { width: 24, height: 24 };
const JOBBER = { width: 367, height: 66 };

/**
 * An integration's logo, sized by height. `full` shows Jobber's wordmark; `mark` (square slots such as the
 * Collecting rings) keeps Jobber as its letter tile because its logo is a wide wordmark.
 */
export function IntegrationLogo({
  system,
  variant = "full",
  className,
}: {
  system: IntegrationSystem;
  variant?: "full" | "mark";
  className?: string;
}) {
  if (system === "Jobber") {
    if (variant === "mark") {
      return (
        <span
          role="img"
          aria-label="Jobber"
          className={cn(
            "inline-grid aspect-square shrink-0 place-items-center rounded-md bg-[#1c4e80] text-[0.55em] font-extrabold text-white",
            className,
          )}
        >
          J
        </span>
      );
    }
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <Image
          src="/brand/jobber-logo-navy.svg"
          alt="Jobber"
          {...JOBBER}
          unoptimized
          className="h-full w-auto dark:hidden"
        />
        <Image
          src="/brand/jobber-logo-lime.svg"
          alt="Jobber"
          {...JOBBER}
          unoptimized
          className="hidden h-full w-auto dark:block"
        />
      </span>
    );
  }
  return (
    <Image
      src={
        system === "Gusto"
          ? "/brand/gusto-wordmark.svg"
          : "/brand/quickbooks-mark.svg"
      }
      alt={system}
      {...SQUARE}
      unoptimized
      className={cn(
        "aspect-square h-full w-auto shrink-0",
        // Gusto's file is a wordmark centred in a square, so it needs more room than the QuickBooks mark.
        system === "Gusto" && "scale-[1.4]",
        className,
      )}
    />
  );
}

/** Maps the source names used across the app to a logo, or null for anything else (Venmo, rules, exports). */
export function integrationOf(name: string): IntegrationSystem | null {
  const n = name.toLowerCase();
  if (n.startsWith("jobber")) return "Jobber";
  if (n.startsWith("gusto")) return "Gusto";
  if (n === "qbo" || n.startsWith("quickbooks")) return "QuickBooks";
  return null;
}
