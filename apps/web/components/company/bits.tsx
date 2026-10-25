import { cn } from "@/lib/utils";
import type { CompanyPerson, PersonTone } from "@/lib/view-types/company";

// Small pieces the Company page and Onboarding share. App marks use each app's own brand color in both themes.
const MARKS = {
  jobber: { letter: "J", name: "Jobber", className: "rounded-md bg-[#1c4e80]" },
  gusto: { letter: "g", name: "Gusto", className: "rounded-md bg-[#f45d48]" },
  venmo: { letter: "V", name: "Venmo", className: "rounded-full bg-[#3d95ce]" },
  qbo: {
    letter: "qb",
    name: "QuickBooks",
    className: "rounded-full bg-[#2ca01c]",
  },
  rule: { letter: "R", name: "Rule", className: "rounded-md bg-sunset" },
} as const;

export type MarkKind = keyof typeof MARKS;

export function AppMark({
  app,
  size = "sm",
  off = false,
}: {
  app: MarkKind;
  size?: "sm" | "lg";
  off?: boolean;
}) {
  const m = MARKS[app];
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-extrabold text-white",
        size === "sm" ? "size-5 text-[9px]" : "size-9 text-[13px]",
        off ? "bg-transparent" : m.className,
        app === "rule" && !off && "text-sunset-ink",
      )}
    >
      {off ? "" : m.letter}
    </span>
  );
}

/** Jobber / Gusto / Venmo marks, blank where the person is not on record. */
export function FoundIn({ foundIn }: { foundIn: CompanyPerson["foundIn"] }) {
  const where = (["jobber", "gusto", "venmo"] as const).filter(
    (k) => foundIn[k],
  );
  return (
    <span className="flex gap-1">
      {(["jobber", "gusto", "venmo"] as const).map((k) => (
        <AppMark key={k} app={k} off={!foundIn[k]} />
      ))}
      <span className="sr-only">
        Found in {where.map((k) => MARKS[k].name).join(", ") || "no app"}
      </span>
    </span>
  );
}

const DOT: Record<PersonTone, string> = {
  ready: "bg-muted-foreground/30",
  info: "bg-ask",
  look: "bg-[#f59e0b]",
  blocked: "bg-destructive",
};
const TEXT: Record<PersonTone, string> = {
  ready: "text-muted-foreground font-medium",
  info: "text-muted-foreground font-medium",
  look: "text-hold font-semibold",
  blocked: "text-destructive font-semibold",
};

export function StatusDot({
  tone,
  label,
  className,
}: {
  tone: PersonTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", DOT[tone])}
      />
      <span className={cn("truncate leading-tight", TEXT[tone])}>{label}</span>
    </span>
  );
}

export function Initials({
  text,
  size = "sm",
}: {
  text: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-muted font-extrabold text-foreground/80",
        size === "sm" ? "size-8 text-[11px]" : "size-13 text-base",
      )}
    >
      {text}
    </span>
  );
}

/** Pill-shaped filter chip with a count, as in the mockup's people filters. */
export function FilterChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        pressed
          ? "bg-primary font-bold text-primary-foreground"
          : "border bg-card font-semibold text-foreground/80 hover:bg-muted",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] font-extrabold",
            pressed
              ? "bg-primary-foreground/20"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
