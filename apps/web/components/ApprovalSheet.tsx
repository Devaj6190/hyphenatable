"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AgentChip } from "@/components/AgentChip";
import { DenyReason } from "@/components/DenyReason";
import { type Status, StatusBadge } from "@/components/StatusBadge";
import { TextPreview } from "@/components/TextPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { companies } from "@/lib/companies";
import { MAX_QUESTION_LEN, questionTextError } from "@/lib/question";
import type { Question, ThreadMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const roleLabel: Record<Question["toRole"], string> = {
  owner: "you",
  manager: "the manager",
  employee: "the employee",
};

const statusBadge: Record<
  Question["status"],
  { status: Status; label: string }
> = {
  draft: { status: "needs-you", label: "Waiting for your OK" },
  approved: { status: "asked", label: "Approved · sending" },
  sent: { status: "asked", label: "Sent · waiting for reply" },
  reminded: { status: "asked", label: "Reminded · waiting" },
  answered: { status: "needs-you", label: "Reply in" },
  expired: { status: "held", label: "No reply · item held" },
  denied: { status: "closed", label: "Denied" },
};

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li
      className={cn(
        "flex items-center gap-2",
        ok ? "text-foreground" : "text-destructive",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-4", ok ? "text-ok" : "text-destructive")}
      />
      {children}
    </li>
  );
}

// Fixture mode: decisions live in component state only. Convex wiring (questions.approve/edit/deny) comes with B-02;
// set state from the mutation's result so the success transition only plays once the backend confirms.
export function ApprovalSheet({
  question,
  recipientName,
  thread = [],
  canDecide = true,
  onDecided,
}: {
  question: Question;
  recipientName?: string;
  /** The question's messages from the server (data.thread); replies show in the phone preview. */
  thread?: ThreadMessage[];
  /** False when this viewer may only read (a manager looking at a text addressed to themselves). */
  canDecide?: boolean;
  /** Called with a plain summary after a decision, for the inline timeline. */
  onDecided?: (summary: string) => void;
}) {
  const [status, setStatus] = useState(question.status);
  const [text, setText] = useState(question.text);
  const [draft, setDraft] = useState(question.text);
  const [mode, setMode] = useState<"view" | "edit" | "deny">("view");
  const [edited, setEdited] = useState(false);

  const who = recipientName ?? roleLabel[question.toRole];
  const shown = mode === "edit" ? draft : text;
  const error = questionTextError(shown);
  const replies = thread.filter((m) => m.direction === "in");
  const reading = replies.findLast((m) => m.interpretation)?.interpretation;
  const badge = statusBadge[status];
  const timeZone =
    companies[question.companyId]?.timezone ?? "America/Los_Angeles";

  return (
    <Card className="@container gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-(--card-spacing)">
        <h2 className="text-lg font-semibold">
          Text to {who}
          {recipientName && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {question.toRole}
            </span>
          )}
        </h2>
        <StatusBadge
          key={status}
          status={badge.status}
          label={badge.label}
          className="animate-in duration-(--dur-success) ease-out-soft fade-in zoom-in-95"
        />
      </div>

      <div className="grid gap-6 px-(--card-spacing) @xl:grid-cols-[minmax(0,1fr)_18rem] @xl:items-start">
        <div className="order-first @xl:order-last">
          <TextPreview
            text={shown}
            options={question.options}
            kind={question.kind}
            replies={replies}
            sentAt={question.sentAt}
            timeZone={timeZone}
            label={`Preview of the text ${who} gets`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {status === "draft" && (
            <p className="text-sm text-muted-foreground">
              Drafted by{" "}
              <AgentChip agent="messenger" className="align-middle" />. Nothing
              is sent until a person approves it.
            </p>
          )}

          {mode === "edit" ? (
            <div className="flex animate-in flex-col gap-2 duration-(--dur-sheet) ease-out-soft fade-in slide-in-from-top-1">
              <label
                htmlFor={`q-${question.id}`}
                className="text-sm font-medium"
              >
                Edit the text
              </label>
              <Textarea
                id={`q-${question.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                aria-invalid={error !== null}
                aria-describedby={`q-${question.id}-count`}
                className="bg-card text-base"
              />
              <div className="flex gap-2">
                <Button
                  disabled={error !== null}
                  onClick={() => {
                    setText(draft);
                    setEdited(draft !== question.text);
                    setMode("view");
                  }}
                >
                  Save text
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(text);
                    setMode("view");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {(status === "draft" || mode === "edit") && (
            <ul
              id={`q-${question.id}-count`}
              aria-live="polite"
              className="flex flex-col gap-1.5 text-sm"
            >
              <Check
                ok={shown.length <= MAX_QUESTION_LEN && shown.trim() !== ""}
              >
                <span className="tabular-nums">
                  {shown.length} of {MAX_QUESTION_LEN} characters
                </span>
              </Check>
              <Check ok={!shown.includes("$")}>No dollar amounts</Check>
              <Check ok>
                {question.kind === "poll"
                  ? `Sent as a poll, ${question.options?.length ?? 0} choices`
                  : "Sent as a text, reply with a number"}
              </Check>
            </ul>
          )}
          {error && mode === "edit" && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {edited && (
            <p className="text-sm text-muted-foreground">
              Edited by you before sending.
            </p>
          )}

          {reading && (
            <p className="rounded-control bg-muted/60 px-3 py-2.5 text-sm">
              <AgentChip agent="messenger" className="mr-2 align-middle" />
              {reading}
            </p>
          )}

          {status === "draft" && canDecide && mode === "deny" && (
            <DenyReason
              what="text"
              onCancel={() => setMode("view")}
              onDeny={(reason) => {
                setStatus("denied");
                setMode("view");
                onDecided?.(`Denied the text to ${who}. Reason: ${reason}.`);
              }}
            />
          )}

          {status === "draft" && canDecide && mode === "view" && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={error !== null}
                onClick={() => {
                  setStatus("approved");
                  onDecided?.(
                    `Approved the text to ${who}${edited ? " after editing it" : ""}.`,
                  );
                }}
              >
                Approve and send
              </Button>
              <Button variant="secondary" onClick={() => setMode("edit")}>
                Edit
              </Button>
              <Button variant="quiet" onClick={() => setMode("deny")}>
                Deny
              </Button>
            </div>
          )}
          {status === "draft" && !canDecide && (
            <p className="text-sm text-muted-foreground">
              The owner approves the text that reaches you.
            </p>
          )}

          {status === "approved" && (
            <p className="animate-in text-sm duration-(--dur-success) fade-in">
              Approved by you. Fixture mode: nothing was sent. With the courier
              running, this goes to {who}’s phone.
            </p>
          )}
          {status === "denied" && (
            <p className="animate-in text-sm duration-(--dur-success) fade-in">
              Denied by you. Nothing will be sent and the item stays open.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            No phone numbers or dollar amounts appear in texts.
          </p>
        </div>
      </div>
    </Card>
  );
}
