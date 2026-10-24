"use client";

import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { FlaskConical, RotateCcw, Timer } from "lucide-react";
import { useState } from "react";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { Segmented } from "@/components/Segmented";
import { SimulatedChip } from "@/components/SimulatedChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { companies } from "@/lib/companies";
import {
  clearLocal,
  LOCAL_SOURCE,
  recordLocal,
  useDemoLocal,
  withLocal,
} from "@/lib/demoLocal";
import { fixtureQuestions, workerName } from "@/lib/fixtures";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

// By name so this builds before B's generated api has demo.* (same pattern as FlagsList).
const demoReset = makeFunctionReference<
  "mutation",
  { companyKey: string; toCycle: 1 | 2 },
  unknown
>("demo:reset");
const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const OPEN: Question["status"][] = ["draft", "approved", "sent", "reminded"];
const statusWord: Record<Question["status"], string> = {
  draft: "not approved yet",
  approved: "approved",
  sent: "sent",
  reminded: "reminded",
  answered: "answered",
  expired: "expired",
  denied: "denied",
};

// The three canned builders in the C plan (C-11, 8.3). Each names the check it should fire.
const STARTERS = [
  {
    label: "Pay jumps",
    checkId: "CHK-22",
    text: "A worker's gross doubled this cycle; every entry has a job.",
  },
  {
    label: "Unknown expense category",
    checkId: "CHK-17",
    text: "A purchase arrived with an expense category we have never seen.",
  },
  {
    label: "Two apps disagree on a rate",
    checkId: "CHK-10",
    text: "Jobber and Gusto show different pay rates for the same worker.",
  },
];

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-left text-sm font-medium transition-colors duration-(--dur-hover) outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        on
          ? "bg-foreground text-background"
          : "bg-muted text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  icon: typeof Timer;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 px-(--card-spacing)">
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden className="size-5 text-link" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

export function DemoPanel({
  companyId,
  dataKind,
}: {
  companyId: string;
  dataKind: DataKind;
}) {
  const local = useDemoLocal();
  const company = companies[companyId];
  const tz = company?.timezone ?? "UTC";
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  const questions = fixtureQuestions
    .filter((q) => q.companyId === companyId)
    .map((q) => withLocal(q, local));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="ask">
          <Timer aria-hidden />
          Demo mode is on · reminders 2 minutes after a text is sent
        </Badge>
        <DataLabel
          kind={dataKind}
          detail={`${company?.label ?? companyId}${company?.cycle ? `, cycle ${company.cycle.number}` : ""}`}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <ResetCard
            loaded={companies.a?.cycle?.number ?? null}
            localCount={local.events.length}
            time={time}
          />
          <ScenarioCard />
        </div>
        <div className="flex flex-col gap-5">
          <SimulatedReplyCard
            companyId={companyId}
            questions={questions.filter((q) => OPEN.includes(q.status))}
            last={local.events.findLast(
              (e) => e.type === "demo.simulated_reply",
            )}
            time={time}
          />
          <TimersCard questions={questions} time={time} />
        </div>
      </div>
    </div>
  );
}

function ResetCard({
  loaded,
  localCount,
  time,
}: {
  loaded: number | null;
  localCount: number;
  time: Intl.DateTimeFormat;
}) {
  const [toCycle, setToCycle] = useState<1 | 2>(2);
  return (
    <Section title="Reset Company A" icon={RotateCcw}>
      <p className="text-muted-foreground">
        Restores a saved snapshot of Company A. Phones and sent texts are not
        touched.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            [1, "Cycle 1", "First run, nothing learned yet"],
            [2, "Cycle 2", "After one cycle of answers"],
          ] as const
        ).map(([n, label, note]) => (
          <button
            key={n}
            type="button"
            aria-pressed={toCycle === n}
            onClick={() => setToCycle(n)}
            className={cn(
              "pressable flex flex-col gap-0.5 rounded-control border p-4 text-left transition-colors duration-(--dur-hover) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              toCycle === n
                ? "border-foreground bg-accent"
                : "border-input bg-card hover:bg-muted",
            )}
          >
            <span className="font-semibold">{label}</span>
            <span className="text-sm text-muted-foreground">{note}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Loaded now: {loaded ? `cycle ${loaded}` : "no cycle"} (fixture copy in
        lib/companies.ts)
      </p>
      {hasConvex ? (
        <ConvexReset toCycle={toCycle} time={time} />
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled className="self-start">
            Reset to cycle {toCycle}
          </Button>
          <p className="text-sm text-muted-foreground">
            Calls demo.reset, which needs a Convex deployment
            (NEXT_PUBLIC_CONVEX_URL is not set).
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
        <Button
          variant="secondary"
          disabled={localCount === 0}
          onClick={clearLocal}
        >
          Clear this browser’s demo changes
        </Button>
        <span className="text-muted-foreground tabular-nums">
          {localCount} recorded here ({LOCAL_SOURCE})
        </span>
      </div>
    </Section>
  );
}

function ConvexReset({
  toCycle,
  time,
}: {
  toCycle: 1 | 2;
  time: Intl.DateTimeFormat;
}) {
  const reset = useMutation(demoReset);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    { ok: true; at: Date; ms: number } | { ok: false; error: string } | null
  >(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        className="self-start"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const t0 = performance.now();
          try {
            await reset({ companyKey: "a", toCycle });
            setResult({ ok: true, at: new Date(), ms: performance.now() - t0 });
          } catch (e) {
            setResult({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Resetting…" : `Reset to cycle ${toCycle}`}
      </Button>
      {result?.ok && (
        <output className="block text-sm text-muted-foreground tabular-nums">
          Last reset {time.format(result.at)} · took{" "}
          {(result.ms / 1000).toFixed(1)} s (measured in this browser)
        </output>
      )}
      {result && !result.ok && (
        <p className="text-sm text-destructive" role="alert">
          Reset failed: {result.error}
        </p>
      )}
    </div>
  );
}

function SimulatedReplyCard({
  companyId,
  questions,
  last,
  time,
}: {
  companyId: string;
  questions: Question[];
  last: { at: string; summary: string } | undefined;
  time: Intl.DateTimeFormat;
}) {
  const [qid, setQid] = useState(questions[0]?.id ?? "");
  const [persona, setPersona] = useState<"manager" | "owner">("manager");
  const [reply, setReply] = useState("");
  const q = questions.find((x) => x.id === qid) ?? questions[0];

  const send = () => {
    if (!q || !reply.trim()) return;
    recordLocal({
      event: {
        companyId,
        cycleId: q.cycleId,
        actor: { kind: "agent", id: `persona:${persona}`, agent: null },
        type: "demo.simulated_reply",
        summary: `Simulated ${persona} replied "${reply.trim()}" to the question for ${workerName(q.toWorkerId)}.`,
        refs: {
          questionId: q.id,
          ...(q.flagIds[0] && { flagId: q.flagIds[0] }),
        },
        data: {
          source: `Demo panel, reply picked by the operator, ${LOCAL_SOURCE}`,
          simulated: true,
        },
      },
      message: {
        questionId: q.id,
        workerId: q.toWorkerId,
        direction: "in",
        text: reply.trim(),
        kind: "text",
        simulated: true,
      },
      question: { id: q.id, status: "answered" },
    });
    setReply("");
  };

  return (
    <Section
      title="Simulated reply"
      icon={FlaskConical}
      badge={<SimulatedChip />}
    >
      <p className="text-muted-foreground">
        When no one is on the phone, a persona plays the {persona}. Every reply
        it writes says Simulated in the inbox, the timeline and the audit log.
      </p>
      {questions.length === 0 ? (
        <p className="rounded-control border border-dashed px-4 py-6 text-center text-muted-foreground">
          No open questions to reply to.
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Open question
            <select
              className="h-10 rounded-control border border-input bg-card px-3 font-normal outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              value={q?.id}
              onChange={(e) => {
                setQid(e.target.value);
                setReply("");
              }}
            >
              {questions.map((x) => (
                <option key={x.id} value={x.id}>
                  {workerName(x.toWorkerId)} · {x.id} · {statusWord[x.status]}
                </option>
              ))}
            </select>
          </label>
          {q && (
            <p className="rounded-control bg-muted/60 p-3 text-[0.9375rem]">
              {q.text}
            </p>
          )}
          <Segmented
            label="Reply as"
            value={persona}
            onValueChange={setPersona}
            options={[
              { value: "manager", label: "As manager" },
              { value: "owner", label: "As owner" },
            ]}
            className="self-start"
          />
          {q?.options && (
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Reply</legend>
              {q.options.map((o, i) => (
                <Pill
                  key={o}
                  on={reply === String(i + 1)}
                  onClick={() => setReply(String(i + 1))}
                >
                  {i + 1} · {o}
                </Pill>
              ))}
            </fieldset>
          )}
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={q?.options ? "Or type a short reply" : "Short reply"}
            aria-label="Simulated reply text"
            maxLength={240}
          />
          <Button
            type="submit"
            size="lg"
            className="self-start"
            disabled={!reply.trim()}
          >
            Send simulated reply
          </Button>
          <p className="text-sm text-muted-foreground">
            Fixture mode: you pick the reply and it stays in this browser.
            demo.simulatedReply (Claude writing it) needs flags from Convex.
          </p>
        </form>
      )}
      {last && (
        <div className="flex flex-col gap-1 border-t pt-4 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            Last simulated reply · {time.format(new Date(last.at))}
            <SimulatedChip />
          </span>
          <span>{last.summary}</span>
        </div>
      )}
    </Section>
  );
}

function ScenarioCard() {
  const [text, setText] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  return (
    <Section title="Try your own case" icon={FlaskConical}>
      <p className="text-muted-foreground">
        Describe something that could go wrong. It is added to this cycle and
        every check runs.
      </p>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCheckId(null);
        }}
        rows={3}
        aria-label="Describe the case"
        placeholder="A worker's gross doubled this cycle; every entry has a job."
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Or start from</span>
        <div className="flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <Pill
              key={s.checkId}
              on={checkId === s.checkId}
              onClick={() => {
                setText(s.text);
                setCheckId(s.checkId);
              }}
            >
              {s.label}
              <span className="text-xs opacity-70">{s.checkId}</span>
            </Pill>
          ))}
        </div>
      </div>
      <Button size="lg" className="self-start" disabled>
        Run checks
      </Button>
      <p className="text-sm text-muted-foreground">
        Calls demo.scenario, then checks.run. Not available in fixture mode:
        nothing is added and no result is shown until flags come from Convex.
        Free text with no builder goes to the Auditor as an unknown case.
      </p>
    </Section>
  );
}

function TimersCard({
  questions,
  time,
}: {
  questions: Question[];
  time: Intl.DateTimeFormat;
}) {
  const pending = questions.filter(
    (q) => (q.status === "sent" || q.status === "reminded") && q.remindAt,
  );
  return (
    <Section title="Reminder timers" icon={Timer}>
      <p className="text-muted-foreground">
        In demo mode a reminder goes out 2 minutes after a text is sent and not
        answered, instead of 4 business hours.
      </p>
      {pending.length === 0 ? (
        <p className="rounded-control border border-dashed px-4 py-6 text-center text-muted-foreground">
          No texts are waiting on a reminder.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {pending.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <span>
                {workerName(q.toWorkerId)} · {q.id}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {q.status === "reminded"
                  ? "Reminder sent"
                  : `Reminder at ${time.format(new Date(q.remindAt as string))}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        From Question.remindAt, set by the backend when a text is sent.
      </p>
    </Section>
  );
}
