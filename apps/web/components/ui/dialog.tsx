"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  scrim = "frosted",
  ...props
}: DialogPrimitive.Backdrop.Props & { scrim?: "frosted" | "plain" }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 transition-opacity duration-(--dur-sheet) ease-out-soft data-ending-style:opacity-0 data-starting-style:opacity-0",
        scrim === "frosted" ? "frosted-scrim" : "bg-(--scrim)",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  scrim = "frosted",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** Surrounding layer: frosted (default) or a plain tinted scrim. The dialog body is always solid. */
  scrim?: "frosted" | "plain";
}) {
  return (
    <DialogPortal>
      <DialogOverlay scrim={scrim} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Phone (< sm): a bottom sheet with a grabber and safe-area padding. sm and up: the centered dialog.
          "fixed inset-x-0 bottom-0 z-50 grid max-h-[90dvh] w-full gap-4 overflow-y-auto rounded-t-overlay border-t bg-raised p-5 pt-7 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-overlay outline-none transition-[opacity,translate,scale] duration-(--dur-sheet) ease-out-soft before:absolute before:top-2.5 before:left-1/2 before:h-1.5 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-border data-ending-style:translate-y-10 data-ending-style:opacity-0 data-starting-style:translate-y-10 data-starting-style:opacity-0",
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-none sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-visible sm:rounded-overlay sm:border sm:p-6 sm:before:hidden sm:data-ending-style:translate-y-[calc(-50%+8px)] sm:data-starting-style:translate-y-[calc(-50%+8px)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col-reverse gap-2 border-t bg-muted/60 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:rounded-b-overlay sm:px-6 sm:py-4",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-xl leading-tight font-semibold pr-10",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
