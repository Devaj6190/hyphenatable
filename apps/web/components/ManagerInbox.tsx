"use client";

import { Check, Eye } from "lucide-react";
import { useState } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { inboxActions } from "@/components/manager/actions";
import { InboxItem } from "@/components/manager/InboxItem";
import {
  employeeAnswer,
  type ItemState,
  isDone,
  itemState,
} from "@/components/manager/inboxState";
import { useRole } from "@/components/RoleProvider";
import { SimulatedChip } from "@/components/SimulatedChip";
import { Button } from "@/components/ui/button";
import { DEMO_MODE } from "@/lib/demo";
import { LOCAL_SOURCE, useDemoLocal } from "@/lib/demoLocal";
import type { ManagerInboxV3, ManagerItem } from "@/lib/view-types/manager";

// The manager's inbox (V3), whoever is switched in. Two groups: "Fix in Jobber" (edit there, then I updated
// it → checking → fixed or still wrong) and "Quick answers" (one tap). The server built every item from the
// crew's manager-routed flags with pay removed; this component only renders and records taps.
export function ManagerInbox({
  data,
  dataKind,
  timezone,
  companyLabel,
}: {
  data: ManagerInboxV3;
  dataKind: DataKind;
  timezone: string;
  companyLabel: string;
}) {
  const { role } = useRole();
  const local = useDemoLocal();
  const events = local.events.filter((e) => e.companyId === data.companyId);
  const states = new Map<string, ItemState>(
    data.items.map((i) => [i.flagId, itemState(i.flagId, events)]),
  );
  const stateOf = (i: ManagerItem) =>
    states.get(i.flagId) ?? ({ st: "open" } as const);

  const owner = data.owner?.firstName ?? "the owner";
  const manager = data.manager?.firstName;
  const actions = inboxActions({
    companyId: data.companyId,
    cycleId: data.cycleId,
    managerId: data.manager?.id ?? "manager",
    ownerName: owner,
  });

  const open = data.items.filter((i) => !isDone(stateOf(i)));
  const done = data.items.filter((i) => isDone(stateOf(i)));
  const fixes = open.filter((i) => i.kind === "fix");
  const answers = open.filter((i) => i.kind === "answer");
  const total = data.items.length;
  const left = open.length;

  // One item open at a time. After a send, the next item that is not mid-check opens.
  const [openId, setOpenId] = useState<string | null>(
    () => open[0]?.flagId ?? null,
  );
  const nextAfter = (id: string) =>
    open.find((i) => i.flagId !== id && stateOf(i).st !== "checking")?.flagId ??
    null;

  // The open item just finished (a re-check came back fixed): move on to the next one.
  if (openId !== null && done.some((i) => i.flagId === openId))
    setOpenId(nextAfter(openId));

  const groups = [
    {
      key: "fix",
      title: "Fix in Jobber",
      sub: "Edit, then tap I updated it",
      items: fixes,
    },
    {
      key: "answer",
      title: "Quick answers",
      sub: "One tap, nothing to edit",
      items: answers,
    },
  ].filter((g) => g.items.length > 0);

  const result = (i: ManagerItem) => {
    const s = stateOf(i);
    if (s.st === "fixed") return `Fixed in Jobber · ${i.checkId} re-checked`;
    if (s.st === "answered")
      return i.kind === "fix"
        ? `Answer sent to ${owner}: ${i.options[s.option]}`
        : `Answered: ${i.options[s.option]}`;
    return "";
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {role === "owner" && (
        <p className="flex items-start gap-2 rounded-card border border-dashed bg-card px-4 py-3 text-sm">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-link" />
          <span>
            You are seeing {manager ? `${manager}'s` : "the manager's"} inbox.{" "}
            {manager ?? "The manager"} sees hours, jobs and record ids here,
            never pay.
          </span>
        </p>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <DataLabel kind={dataKind} detail={companyLabel} />
          {manager && (
            <span>
              {manager} · manager
              {data.period && ` · payroll ${data.period}`}
            </span>
          )}
        </div>
        <h1 className="text-[1.5625rem] leading-tight font-bold tracking-[-0.02em]">
          {total === 0
            ? "Nothing to check right now"
            : left === 0
              ? "All checked"
              : `${left} ${left === 1 ? "thing" : "things"} to check before payroll`}
        </h1>
        {total > 0 && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {owner === "the owner" ? "The owner" : owner} sent you these before
            payroll. Fix the Jobber ones in Jobber and tap{" "}
            <b className="text-foreground">I updated it</b>;{" "}
            {DEMO_MODE
              ? "we check again right away."
              : "the next Jobber sync checks again."}{" "}
            The quick ones just need a tap.
          </p>
        )}
        {total > 0 && (
          <div className="flex items-center gap-2.5">
            <span
              role="progressbar"
              aria-label="Items done"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done.length}
              className="block h-2 flex-1 overflow-hidden rounded bg-border"
            >
              <span
                className="block h-full rounded bg-sunset transition-[width] duration-(--dur-archive) ease-out-soft"
                style={{ width: `${Math.round((done.length / total) * 100)}%` }}
              />
            </span>
            <span className="text-[0.8125rem] font-bold tabular-nums">
              {done.length} of {total} done
            </span>
          </div>
        )}
      </section>

      {groups.map((g) => (
        <section
          key={g.key}
          aria-labelledby={`grp-${g.key}`}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 px-0.5">
            <h2
              id={`grp-${g.key}`}
              className="text-[0.8125rem] font-extrabold tracking-[0.05em] text-muted-foreground uppercase"
            >
              {g.title} · {g.items.length}
            </h2>
            <span className="text-xs text-muted-foreground">{g.sub}</span>
          </div>
          {g.items.map((i) => (
            <InboxItem
              key={i.flagId}
              item={i}
              state={stateOf(i)}
              open={openId === i.flagId}
              onToggle={() => setOpenId(openId === i.flagId ? null : i.flagId)}
              onUpdated={() => {
                const s = stateOf(i);
                actions.updated(i, (s.st === "still-there" ? s.tries : 0) + 1);
              }}
              onAnswer={(option) => {
                actions.answer(i, option);
                setOpenId(nextAfter(i.flagId));
              }}
              ownerName={owner}
              workerAnswer={employeeAnswer(i.flagId, events)?.answer ?? null}
              timeZone={timezone}
              dataKind={dataKind}
            />
          ))}
        </section>
      ))}

      {done.length > 0 && (
        <section aria-labelledby="grp-done" className="flex flex-col gap-2">
          <h2
            id="grp-done"
            className="px-0.5 text-[0.8125rem] font-extrabold tracking-[0.05em] text-muted-foreground uppercase"
          >
            Done · {done.length}
          </h2>
          {done.map((i) => {
            const s = stateOf(i);
            return (
              <div
                key={i.flagId}
                className="flex animate-in items-center gap-2.5 rounded-card border bg-card px-3.5 py-3 duration-(--dur-success) fade-in"
              >
                <span
                  aria-hidden
                  className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-ok text-background"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{i.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {result(i)}
                  </span>
                  {s.st === "fixed" && s.simulated && (
                    <SimulatedChip className="mt-1" />
                  )}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    actions.undo(i);
                    setOpenId(i.flagId);
                  }}
                >
                  Undo
                </Button>
              </div>
            );
          })}
        </section>
      )}

      {total > 0 && left === 0 && (
        <p className="animate-in rounded-card border border-ok/30 bg-ok-soft px-4.5 py-4 text-[0.9375rem] leading-relaxed fade-in">
          <b>All done{manager ? `. Thanks, ${manager}` : ""}.</b> {owner} sees
          everything you fixed and answered. Payroll goes on from here.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        RollPay reads Jobber and never edits it. You see your crew's hours and
        jobs, never pay. Source: {data.source}.
        {events.length > 0 && ` Your taps are saved in ${LOCAL_SOURCE}.`}{" "}
        {data.items.some((i) => stateOf(i).st !== "open") && (
          <button
            type="button"
            onClick={() => {
              for (const i of data.items)
                if (stateOf(i).st !== "open") actions.undo(i);
              setOpenId(data.items[0]?.flagId ?? null);
            }}
            className="font-semibold text-link underline-offset-4 hover:underline"
          >
            Start over
          </button>
        )}
      </p>
    </div>
  );
}
