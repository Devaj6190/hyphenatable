"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LiveContext } from "@/lib/live/ids";
import { cn } from "@/lib/utils";

const statusWord = {
  draft: "not approved yet",
  approved: "approved, not sent",
  sent: "sent",
  reminded: "reminded",
} as Record<string, string>;

// The demo panel's reply card on Convex: approve a drafted text as the owner, then answer it as the person would.
// Both call the real functions (questions.approve, demo.simulatedReply); the reply goes through the same reader as a
// real text, and Convex labels every message and audit event it writes as simulated.
export function LiveSimulatedReply({ ctx }: { ctx: LiveContext }) {
  const questions = useQuery(api.questions.forDemo, {
    companyId: ctx.ids.companyId,
  });
  const approve = useMutation(api.questions.approve);
  const simulate = useAction(api.demo.simulatedReply);
  const [qid, setQid] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);

  if (questions === undefined)
    return <p className="text-muted-foreground">Loading questions…</p>;
  if (questions.length === 0)
    return (
      <p className="rounded-control border border-dashed px-4 py-6 text-center text-muted-foreground">
        No open questions in Convex. Questions are drafted when the checks run;
        reset the company to start over.
      </p>
    );
  const q = questions.find((x) => x.id === qid) ?? questions[0];
  const who = (id: string) => ctx.names[id]?.split(" ")[0] ?? "the worker";

  const run = async (step: () => Promise<string>) => {
    setPending(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await step() });
    } catch (e) {
      setResult({
        ok: false,
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Question
        <select
          className="h-10 rounded-control border border-input bg-card px-3 font-normal outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring"
          value={q.id}
          onChange={(e) => {
            setQid(e.target.value);
            setReply("");
            setResult(null);
          }}
        >
          {questions.map((x) => (
            <option key={x.id} value={x.id}>
              To {who(x.toWorkerId)} · {statusWord[x.status] ?? x.status}
            </option>
          ))}
        </select>
      </label>
      <p className="rounded-control bg-muted/60 p-3 text-[0.9375rem]">
        {q.text}
      </p>

      {q.status === "draft" ? (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="self-start"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await approve({
                  questionId: q.id as Id<"questions">,
                  userId: ctx.ids.ownerId,
                });
                return "Approved as the owner. It is queued as a text; reply to it below.";
              })
            }
          >
            {pending ? "Approving…" : "Approve as the owner"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Nothing is texted without an approval. This is the owner's approval,
            recorded in the audit log.
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await simulate({
                questionId: q.id as Id<"questions">,
                text: reply.trim() || undefined,
              });
              setReply("");
              return `Simulated reply "${r.reply}" recorded; the question is now ${r.status}. Any change it proposes waits for the owner on the problem's page.`;
            });
          }}
        >
          {q.options && (
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Reply</legend>
              {q.options.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={reply === String(i + 1)}
                  onClick={() => setReply(String(i + 1))}
                  className={cn(
                    "pressable inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
                    reply === String(i + 1)
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-accent",
                  )}
                >
                  {i + 1} · {o}
                </button>
              ))}
            </fieldset>
          )}
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={
              q.options ? "Or type a short reply" : "Short reply, e.g. 4:30pm"
            }
            aria-label="Simulated reply text"
            maxLength={240}
          />
          <Button
            type="submit"
            size="lg"
            className="self-start"
            disabled={pending}
          >
            {pending
              ? "Sending…"
              : reply.trim()
                ? "Send simulated reply"
                : "Send simulated reply (first option)"}
          </Button>
        </form>
      )}

      {result && (
        <output
          role={result.ok ? undefined : "alert"}
          className={cn(
            "block text-sm",
            result.ok ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {result.text}
        </output>
      )}
    </div>
  );
}
