"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { PageHeader } from "@/components/PageHeader";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { SourceChip } from "@/components/SourceChip";
import { type Status, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorkerThread } from "@/components/WorkerThread";
import {
  LOCAL_SOURCE,
  recordLocal,
  useDemoLocal,
  withLocal,
} from "@/lib/demoLocal";
import { MAX_QUESTION_LEN, questionTextError } from "@/lib/question";
import { FIXTURE_SOURCE } from "@/lib/sources";
import { formatWhen } from "@/lib/time";
import type { Flag, Question } from "@/lib/types";
import type { ManagerInboxData, ThreadView } from "@/lib/view-types";

// What the inbox renders has no pay field at all: dollarsCents is dropped here, before any component sees it.
type CrewFlag = Omit<Flag, "affects"> & {
  affects: { workerId: string | null; jobId: string | null };
};
function crewView({
  affects: { dollarsCents: _pay, ...affects },
  ...f
}: Flag): CrewFlag {
  return { ...f, affects };
}

type Item = {
  flag: CrewFlag;
  question: Question | undefined;
  thread: ThreadView;
  name: (workerId: string) => string;
};

const OPEN_TO_MANAGER: Question["status"][] = ["sent", "reminded"];

// The manager's view, whoever is switched in. The server already picked the crew's flags and removed pay;
// crewView drops the pay field from the type as a second guard.
export function ManagerInbox({
  data,
  dataKind,
  timezone: tz,
  companyLabel,
  manager,
  names,
}: {
  data: ManagerInboxData;
  dataKind: DataKind;
  timezone: string;
  companyLabel: string;
  manager: { id: string; displayName: string } | null;
  names: Record<string, string>;
}) {
  const local = useDemoLocal();
  const firstName = manager?.displayName.split(" ")[0];
  const name = (id: string) => names[id] ?? id;

  const items: Item[] = [...data.needsOk, ...data.rest].map((i) => ({
    flag: crewView(i.flag),
    question: i.question ? withLocal(i.question, local) : undefined,
    thread: i.thread ?? {
      workerName:
        i.recipientName ?? (i.question ? name(i.question.toWorkerId) : "Reply"),
      messages: [],
    },
    name,
  }));

  const needsYou = items.filter(({ question: q }) =>
    q?.toRole === "employee"
      ? q.status === "draft"
      : q?.toRole === "manager" && OPEN_TO_MANAGER.includes(q.status),
  );
  const answered = items.filter((i) => i.question?.status === "answered");
  const waiting = items.filter(
    (i) => !needsYou.includes(i) && !answered.includes(i),
  );

  const n = needsYou.length;
  const title =
    n === 0
      ? `${firstName ? `${firstName}, n` : "N"}othing needs you right now`
      : `${firstName ? `${firstName}, ` : ""}${n} ${n === 1 ? "thing needs" : "things need"} you`;
  const actor = {
    kind: "user" as const,
    id: manager?.id ?? "manager",
    agent: null,
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <PageHeader
        title={title}
        description="Answer here or by text. Hours and jobs only; pay is never shown to managers."
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <DataLabel kind={dataKind} detail={companyLabel} />
        <span>Your crew · Source: {FIXTURE_SOURCE}</span>
      </div>

      <Tabs defaultValue="inbox" className="gap-5">
        <TabsList className="self-start">
          <TabsTrigger value="inbox">Inbox · {n}</TabsTrigger>
          <TabsTrigger value="answered">
            Answered · {answered.length}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="flex flex-col gap-4">
          {needsYou.map((i) =>
            i.question?.toRole === "employee" ? (
              <ApproveText
                key={i.flag.id}
                item={i}
                question={i.question}
                onDecide={(status, text) => {
                  const who = name(i.question?.toWorkerId ?? "");
                  const edited = text !== i.question?.text;
                  recordLocal({
                    event: {
                      companyId: i.flag.companyId,
                      cycleId: i.flag.cycleId,
                      actor,
                      type:
                        status === "approved"
                          ? "message.approved"
                          : "message.denied",
                      summary:
                        status === "approved"
                          ? `Manager ${edited ? "edited and approved" : "approved"} the text to ${who}.`
                          : `Manager denied the text to ${who}. Nothing was sent.`,
                      refs: {
                        flagId: i.flag.id,
                        questionId: i.question?.id ?? "",
                      },
                      data: { source: `Manager inbox, ${LOCAL_SOURCE}` },
                    },
                    question: {
                      id: i.question?.id ?? "",
                      status,
                      text,
                    },
                  });
                }}
              />
            ) : (
              <AnswerQuestion
                key={i.flag.id}
                item={i}
                question={i.question as Question}
                timeZone={tz}
                onAnswer={(answer) => {
                  const q = i.question as Question;
                  recordLocal({
                    event: {
                      companyId: i.flag.companyId,
                      cycleId: i.flag.cycleId,
                      actor,
                      type: "message.received",
                      summary: `Manager answered in the inbox: ${answer}.`,
                      refs: { flagId: i.flag.id, questionId: q.id },
                      data: { source: `Manager inbox, ${LOCAL_SOURCE}` },
                    },
                    message: {
                      questionId: q.id,
                      workerId: q.toWorkerId,
                      direction: "in",
                      text: answer,
                      kind: "text",
                    },
                    question: { id: q.id, status: "answered" },
                  });
                }}
              />
            ),
          )}
          {n === 0 && (
            <p className="rounded-card border border-dashed px-5 py-8 text-center text-muted-foreground">
              Nothing to approve or answer. New questions show up here and by
              text.
            </p>
          )}

          {waiting.length > 0 && (
            <section className="mt-4 flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Waiting</h2>
              {waiting.map((i) => (
                <Waiting key={i.flag.id} item={i} timeZone={tz} />
              ))}
            </section>
          )}

          <HowItWorks />
        </TabsContent>

        <TabsContent value="answered" className="flex flex-col gap-4">
          {answered.map((i) => (
            <ItemCard
              key={i.flag.id}
              item={i}
              status="closed"
              statusLabel="Answered"
            >
              <WorkerThread
                thread={i.thread}
                questionId={i.question?.id}
                timezone={tz}
              />
              <p className="text-sm text-muted-foreground">
                The owner approves any change this answer makes.
              </p>
            </ItemCard>
          ))}
          {answered.length === 0 && (
            <p className="rounded-card border border-dashed px-5 py-8 text-center text-muted-foreground">
              No answers yet this cycle.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Shared frame: status, agents, headline, then who / job / where it came from. No money anywhere.
function ItemCard({
  item: { flag, question, name },
  status,
  statusLabel,
  eyebrow,
  children,
}: {
  item: Item;
  status: Status;
  statusLabel?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-4 px-(--card-spacing)">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} label={statusLabel} />
        {eyebrow && (
          <span className="text-sm font-medium text-muted-foreground">
            {eyebrow}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg leading-snug font-semibold">{flag.seen}</h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {[
            flag.affects.workerId && name(flag.affects.workerId),
            flag.affects.jobId && `Job ${flag.affects.jobId}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          {flag.where.map((w) => (
            <SourceChip
              key={`${w.system}-${w.recordId}`}
              system={w.system}
              recordId={w.recordId}
              url={w.url}
            />
          ))}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfidenceBadge confidence={flag.confidence} />
          <PrecedentBadge
            precedent={flag.precedent}
            companyId={flag.companyId}
          />
          {question?.toRole === "employee" && (
            <AgentChip agent="messenger" label="Drafted by Messenger" />
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ApproveText({
  item,
  question,
  onDecide,
}: {
  item: Item;
  question: Question;
  onDecide: (status: "approved" | "denied", text: string) => void;
}) {
  const [text, setText] = useState(question.text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.text);
  const error = questionTextError(editing ? draft : text);
  const who = item.name(question.toWorkerId);
  const first = who.split(" ")[0];

  return (
    <ItemCard
      item={item}
      status="needs-you"
      statusLabel="Needs your OK"
      eyebrow="Approve a text to your crew"
    >
      <div className="flex flex-col gap-2 rounded-control bg-muted/60 p-4">
        <p className="text-xs font-medium text-muted-foreground">
          To {who} · crew · {question.kind === "poll" ? "poll" : "text"}
        </p>
        {editing ? (
          <>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              aria-label={`Text to ${who}`}
              aria-invalid={error !== null}
              aria-describedby={`${question.id}-hint`}
              className="bg-card"
            />
            <p
              id={`${question.id}-hint`}
              className="flex justify-between text-sm"
            >
              <span
                className={error ? "text-destructive" : "text-muted-foreground"}
              >
                {error ?? "Looks good."}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {draft.length}/{MAX_QUESTION_LEN}
              </span>
            </p>
          </>
        ) : (
          <p className="text-[0.9375rem]">{text}</p>
        )}
        {question.options && (
          <ol className="flex flex-wrap gap-1.5 text-sm">
            {question.options.map((o, i) => (
              <li
                key={o}
                className="rounded-full border border-input bg-card px-2.5 py-0.5"
              >
                {i + 1} · {o}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {editing ? (
          <>
            <Button
              size="lg"
              disabled={error !== null}
              onClick={() => {
                setText(draft);
                setEditing(false);
              }}
            >
              Save text
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              disabled={error !== null}
              onClick={() => onDecide("approved", text)}
            >
              Approve and send
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              size="lg"
              variant="quiet"
              onClick={() => onDecide("denied", text)}
            >
              Deny
            </Button>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Nothing goes to {first} until you approve. Texts never include pay or
        phone numbers.
      </p>
    </ItemCard>
  );
}

function AnswerQuestion({
  item,
  question,
  timeZone,
  onAnswer,
}: {
  item: Item;
  question: Question;
  timeZone: string;
  onAnswer: (answer: string) => void;
}) {
  const [text, setText] = useState("");
  const sent = question.sentAt && formatWhen(question.sentAt, timeZone);
  return (
    <ItemCard
      item={item}
      status="asked"
      statusLabel="Question for you"
      eyebrow={question.status === "reminded" ? "Reminder sent" : undefined}
    >
      <p className="text-[0.9375rem]">{question.text}</p>
      {question.options ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((o, i) => (
            <Button
              key={o}
              size="lg"
              variant="secondary"
              className="justify-start"
              onClick={() => onAnswer(`${i + 1} · ${o}`)}
            >
              <span className="text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              {o}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(text.trim());
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            aria-label="Your answer"
          />
          <Button type="submit" size="lg" disabled={!text.trim()}>
            Send answer
          </Button>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        {sent ? `Also sent to you by text at ${sent}. ` : ""}Answer once, either
        place.
      </p>
    </ItemCard>
  );
}

function Waiting({ item, timeZone }: { item: Item; timeZone: string }) {
  const q = item.question;
  const who = q ? item.name(q.toWorkerId) : null;
  const [status, label, note]: [Status, string, string] =
    q?.status === "denied"
      ? ["held", "You denied it", "Nothing was sent. The owner sees it."]
      : q?.toRole === "manager"
        ? [
            "asked",
            "Coming to you",
            "The owner checks this question before it reaches you.",
          ]
        : [
            "asked",
            `Waiting on ${who?.split(" ")[0] ?? "a reply"}`,
            q?.status === "approved"
              ? "Approved by you. Fixture mode: no text left this browser."
              : "Replies show up here as they arrive.",
          ];
  return (
    <ItemCard item={item} status={status} statusLabel={label}>
      <p className="text-sm text-muted-foreground">{note}</p>
      <WorkerThread
        thread={item.thread}
        questionId={q?.id}
        timezone={timeZone}
      />
    </ItemCard>
  );
}

function HowItWorks() {
  return (
    <aside className="mt-4 flex gap-3 rounded-card bg-muted/60 p-5 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-link" />
      <p>
        <span className="font-medium">How this works.</span> You answer
        questions about hours and jobs. You approve texts to your crew before
        they go out. The owner approves every change to pay.
      </p>
    </aside>
  );
}
