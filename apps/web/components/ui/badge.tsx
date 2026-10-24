import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Compact pill. `tone` picks the color pair; `variant="outline"` swaps the soft fill for a border.
// Every status-carrying badge also carries a word (and usually an icon); color is never the only signal.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-(--dur-hover) [&>svg]:pointer-events-none [&>svg]:size-3.5 [a]:hover:brightness-95",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-neutral-chip",
        brand: "bg-accent text-link",
        hold: "bg-hold-soft text-hold",
        ask: "bg-ask-soft text-ask",
        ok: "bg-ok-soft text-ok",
        error: "bg-destructive-soft text-destructive",
        strong: "bg-foreground text-background",
      },
      variant: {
        soft: "",
        outline: "bg-transparent",
      },
    },
    compoundVariants: [
      { variant: "outline", tone: "neutral", className: "border-input" },
      { variant: "outline", tone: "brand", className: "border-link" },
      { variant: "outline", tone: "hold", className: "border-hold" },
      { variant: "outline", tone: "ask", className: "border-ask" },
      { variant: "outline", tone: "ok", className: "border-ok" },
      { variant: "outline", tone: "error", className: "border-destructive" },
    ],
    defaultVariants: { tone: "neutral", variant: "soft" },
  },
);

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, tone, variant, render, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ tone, variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", tone, variant },
  });
}

export { Badge, type BadgeProps, badgeVariants };
