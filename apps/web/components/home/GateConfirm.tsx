"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Gate 1 and Gate 2 from Home: the owner approves, then RollPay prepares, updates and calculates the draft.
// There is no submit. The parent calls drafts.approveGate / drafts.fillGusto and falls back to the demo fill.
export function GateConfirm({
  open,
  onOpenChange,
  title,
  rows,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: { label: string; value: ReactNode }[];
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            You approve exactly what you reviewed. Held items stay out.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-control bg-muted px-4 py-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="text-right font-semibold">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm font-medium">
          RollPay prepares, updates and calculates the draft. It never submits.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Cancel
          </DialogClose>
          <Button onClick={onConfirm}>Approve and fill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
