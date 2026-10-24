"use client";

import { useState } from "react";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Gate 1: the owner approves the Stage 1 workbook as shown. Approving changes nothing in Gusto; filling the
// draft is the next, separate button.
export function GateDialog({
  cycleNumber,
  cleared,
  held,
  totalCents,
  disabled,
  onApprove,
}: {
  cycleNumber: number;
  cleared: number;
  held: number;
  totalCents: number;
  disabled: boolean;
  onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        Approve Gate 1
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve the Stage 1 workbook?</DialogTitle>
          <DialogDescription>
            Cycle {cycleNumber}. You’re approving the wages exactly as the
            workbook shows them.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-control bg-muted px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Wages in the draft</dt>
          <dd className="text-right font-semibold">
            <Money cents={totalCents} />
          </dd>
          <dt className="text-muted-foreground">Workers cleared</dt>
          <dd className="text-right font-medium">{cleared}</dd>
          <dt className="text-muted-foreground">Held, left out</dt>
          <dd className="text-right font-medium">{held}</dd>
        </dl>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>Held items stay out of Gusto until someone answers.</li>
          <li>
            Next, “Fill Gusto draft” writes these lines into the Gusto draft and
            asks Gusto to calculate it.
          </li>
          <li className="font-medium">
            Draft only. PayrollPilot never submits payroll.
          </li>
        </ul>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Not yet
          </DialogClose>
          <Button
            onClick={() => {
              onApprove();
              setOpen(false);
            }}
          >
            Approve Gate 1
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
