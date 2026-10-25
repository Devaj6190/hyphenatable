"use client";

import { Popover } from "@base-ui/react/popover";
import { ExternalLink } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import type { SourceSystem } from "@/lib/types";
import { cn } from "@/lib/utils";

// Where a number came from. The record id opens on hover, on click/tap, and on Enter/Space,
// so provenance never depends on a mouse.
export function SourceChip({
  system,
  recordId,
  url,
}: {
  system: SourceSystem;
  recordId: string;
  url?: string | null;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        aria-label={`${system} record ${recordId}`}
        className={cn(
          badgeVariants({ tone: "neutral", variant: "outline" }),
          "cursor-pointer bg-card outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-popup-open:bg-muted",
        )}
      >
        {system}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="origin-(--transform-origin) rounded-control border bg-raised px-3 py-2 text-sm text-foreground shadow-raised transition-[opacity,scale] duration-(--dur-hover) ease-out-soft data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <p className="text-xs text-muted-foreground">{system} record</p>
            <p className="font-medium">{recordId}</p>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
              >
                Open in {system}
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
