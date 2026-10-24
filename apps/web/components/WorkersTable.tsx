"use client";

import Link from "next/link";
import { FlagsSource } from "@/components/FlagsList";
import { Money } from "@/components/Money";
import { useRole } from "@/components/RoleProvider";
import { SourceChip } from "@/components/SourceChip";
import { flagStatus, StatusBadge } from "@/components/StatusBadge";
import type { Flag } from "@/lib/types";
import type { RosterWorker } from "@/lib/view-types";

const paidBy: Record<RosterWorker["payType"], string> = {
  hourly: "Gusto, hourly",
  salary: "Gusto, salaried",
  commission: "Gusto, commission",
  contractor_venmo: "Venmo",
};

// Most urgent first: what needs the owner, then what waits on someone else.
const urgency: Flag["status"][] = ["open", "answered", "held", "asked"];

// Who is in this payroll and the rate each system holds, as pulled. Rates are shown side by side,
// never reconciled here; hours and pay are computed in the workbook. Rates are owner-only: the server
// sends a manager none (lib/server/home.ts rosterView), and the columns are hidden too.
export function WorkersTable({
  companyId,
  workers,
  flags: fixtureFlags,
}: {
  companyId: string;
  workers: RosterWorker[];
  flags: Flag[];
}) {
  const { role } = useRole();
  if (workers.length === 0)
    return (
      <p className="rounded-card border bg-card p-6 text-muted-foreground">
        No workers pulled for this company yet.
      </p>
    );
  return (
    <FlagsSource companyId={companyId} fixtureFlags={fixtureFlags}>
      {(flags) => (
        <div className="overflow-x-auto rounded-card border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Worker
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Paid by
                </th>
                {role === "owner" && (
                  <>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Pay rate
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Jobber labor rate
                    </th>
                  </>
                )}
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const own = flags.filter(
                  (f) =>
                    f.subject.workerId === w.id || f.affects.workerId === w.id,
                );
                const top = urgency
                  .map((s) => own.find((f) => f.status === s))
                  .find(Boolean);
                return (
                  <tr key={w.id} className="border-t align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {w.displayName}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {w.id} · {w.role}
                      </span>
                    </th>
                    <td className="px-4 py-3">{paidBy[w.payType]}</td>
                    {role === "owner" && (
                      <>
                        <td className="px-4 py-3">
                          <Rate worker={w} system="Gusto" />
                        </td>
                        <td className="px-4 py-3">
                          <Rate worker={w} system="Jobber" />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {w.status === "inactive" ? (
                        <StatusBadge status="closed" label="Inactive" />
                      ) : top ? (
                        <Link
                          href={`/c/${companyId}/flags/${top.id}`}
                          className="rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <StatusBadge {...flagStatus[top.status]} />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          No open problem
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </FlagsSource>
  );
}

function Rate({
  worker: w,
  system,
}: {
  worker: RosterWorker;
  system: "Gusto" | "Jobber";
}) {
  if (system === "Gusto" && w.payType === "salary")
    return <span className="text-muted-foreground">Salary</span>;
  const cents =
    system === "Jobber"
      ? w.jobber?.labourRateCents
      : w.payType === "contractor_venmo"
        ? w.venmoRateCents
        : w.gusto?.rateCents;
  const recordId =
    system === "Jobber"
      ? w.jobber?.userId
      : (w.gusto?.employeeUuid ?? w.gusto?.contractorUuid ?? w.id);
  if (cents == null || !recordId)
    return <span className="text-muted-foreground">None on file</span>;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span>
        <Money cents={cents} />
        /hr
      </span>
      <SourceChip
        system={
          system === "Gusto" && w.payType === "contractor_venmo"
            ? "Workbook"
            : system
        }
        recordId={recordId}
      />
    </span>
  );
}
