"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MAX_QUESTION_LEN, questionTextError } from "@/lib/question";
import type { Question } from "@/lib/types";

const roleLabel: Record<Question["toRole"], string> = {
  owner: "you",
  manager: "the manager",
  employee: "the employee",
};

const statusText: Record<Question["status"], string> = {
  draft: "waiting for your OK",
  approved: "approved",
  sent: "sent, waiting for a reply",
  reminded: "reminded",
  answered: "answered",
  expired: "expired",
  denied: "denied",
};

// Fixture mode: decisions live in component state only. Convex wiring (questions.approve/edit/deny) comes with B-02.
export function ApprovalSheet({ question }: { question: Question }) {
  const [status, setStatus] = useState(question.status);
  const [text, setText] = useState(question.text);
  const [draft, setDraft] = useState(question.text);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(false);

  const decidable = status === "draft";
  const draftError = questionTextError(draft);
  const textError = questionTextError(text);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">
            Text to send to {roleLabel[question.toRole]}
          </h3>
          <Badge
            variant="outline"
            className={
              status === "draft"
                ? "border-transparent bg-ask-soft text-ask"
                : status === "denied"
                  ? "border-transparent bg-hold-soft text-hold"
                  : "border-transparent bg-ok-soft text-ok"
            }
          >
            {statusText[status]}
          </Badge>
          <Badge variant="outline" className="ml-auto">
            {question.kind === "poll" ? "sent as a poll" : "sent as a text"}
          </Badge>
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              aria-label="Text to send"
              aria-invalid={draftError !== null}
            />
            <div className="flex items-center justify-between text-sm">
              <span
                className={
                  draftError ? "text-destructive" : "text-muted-foreground"
                }
              >
                {draftError ?? "Looks good."}
              </span>
              <span className="text-muted-foreground">
                {draft.length}/{MAX_QUESTION_LEN}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={draftError !== null}
                onClick={() => {
                  setText(draft);
                  setEdited(draft !== question.text);
                  setEditing(false);
                }}
              >
                Save text
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(text);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-muted p-3">{text}</p>
        )}

        {question.options && (
          <div className="flex flex-wrap gap-2 text-sm">
            {question.options.map((o, i) => (
              <Badge key={o} variant="outline">
                {i + 1} · {o}
              </Badge>
            ))}
          </div>
        )}
        {edited && (
          <p className="text-sm text-muted-foreground">
            Edited by you before sending.
          </p>
        )}

        {decidable && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={textError !== null}
              onClick={() => setStatus("approved")}
            >
              Approve and send
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="outline" onClick={() => setStatus("denied")}>
              Deny
            </Button>
          </div>
        )}
        {status === "approved" && (
          <p className="text-sm text-muted-foreground">
            Approved by you. Fixture mode: nothing was sent. With the courier
            running, this goes to the manager’s phone.
          </p>
        )}
        {status === "denied" && (
          <p className="text-sm text-muted-foreground">
            Denied by you. Nothing will be sent and the item stays open.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          No phone numbers or dollar amounts appear in texts.
        </p>
      </CardContent>
    </Card>
  );
}
