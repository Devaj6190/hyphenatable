import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePause,
  type LucideIcon,
  MessageCircleQuestion,
  TriangleAlert,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { Flag } from "@/lib/types";

export type Status =
  | "needs-you"
  | "held"
  | "asked"
  | "verified"
  | "sync-incomplete"
  | "closed";

// Amber = needs attention / held, blue = asked / waiting, ok = verified (never brand green),
// red = incomplete sync. Always icon + word.
const spec: Record<
  Status,
  {
    word: string;
    icon: LucideIcon;
    tone: BadgeProps["tone"];
    variant: BadgeProps["variant"];
  }
> = {
  "needs-you": {
    word: "Needs you",
    icon: CircleAlert,
    tone: "hold",
    variant: "soft",
  },
  held: { word: "Held", icon: CirclePause, tone: "hold", variant: "outline" },
  asked: {
    word: "Asked",
    icon: MessageCircleQuestion,
    tone: "ask",
    variant: "soft",
  },
  verified: {
    word: "Verified",
    icon: CircleCheck,
    tone: "ok",
    variant: "soft",
  },
  "sync-incomplete": {
    word: "Incomplete sync",
    icon: TriangleAlert,
    tone: "error",
    variant: "soft",
  },
  closed: {
    word: "Closed",
    icon: CircleMinus,
    tone: "neutral",
    variant: "soft",
  },
};

/** `label` replaces the word (e.g. "Waiting on manager"); icon and color stay tied to `status`. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const s = spec[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} variant={s.variant} className={className}>
      <Icon aria-hidden />
      {label ?? s.word}
    </Badge>
  );
}

// Flag.status → badge. "answered" still needs the owner to look at the reply.
export const flagStatus: Record<
  Flag["status"],
  { status: Status; label?: string }
> = {
  open: { status: "needs-you" },
  asked: { status: "asked", label: "Waiting on reply" },
  answered: { status: "needs-you", label: "Reply in" },
  held: { status: "held" },
  corrected: { status: "verified", label: "Fixed" },
  dismissed: { status: "closed", label: "Dismissed" },
};
