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
import { PreviewNote } from "./WorkbookTable";

// Gate 1: the owner approves the Stage 1 workbook as shown. Approving changes nothing in Gusto; filling the
// draft is the next, separate button. drafts.approveGate isn't wired yet, so approving records nothing and says so.
export function GateDialog({
  cycleNumber,
  cleared,
  held,
  totalCents,
  disabled,
}: {
  cycleNumber: number;
  cleared: number;
  held: number;
  totalCents: number;
  disabled: boolean;
}) {
  const [tried, setTried] = useState(false);
  return (
    <Dialog onOpenChange={(open) => open || setTried(false)}>
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
          <dd className="col-span-2 text-right">
            <PreviewNote />
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
        {tried && (
          <output className="block rounded-control border border-hold/40 bg-hold-soft/40 px-4 py-3 text-sm">
            <span className="font-medium">Not connected yet.</span> Nothing was
            recorded, so Gate 1 stays unapproved.
          </output>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            {tried ? "Close" : "Not yet"}
          </DialogClose>
          <Button disabled={tried} onClick={() => setTried(true)}>
            Approve Gate 1
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
