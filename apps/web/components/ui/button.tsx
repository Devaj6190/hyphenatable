import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// primary: deep green fill; secondary: solid neutral with a visible boundary; quiet: discoverable text action;
// destructive: deny / delete. default, outline, ghost and link are kept as aliases for existing callers.
const primary =
  "bg-primary text-primary-foreground border-primary-edge hover:bg-primary-hover";
const secondary =
  "bg-card text-foreground border-input hover:bg-muted aria-expanded:bg-muted";
const quiet =
  "text-link hover:bg-accent aria-expanded:bg-accent underline-offset-4";

const buttonVariants = cva(
  "pressable group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-medium whitespace-nowrap select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary,
        secondary,
        quiet,
        destructive:
          "bg-(--destructive-fill) text-white hover:brightness-110 dark:border-destructive",
        default: primary,
        outline: secondary,
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        link: "h-auto! px-0! text-link underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        default: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
        xs: "h-7 px-2 text-xs",
        "icon-xs": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
