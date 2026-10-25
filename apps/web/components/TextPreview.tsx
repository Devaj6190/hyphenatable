import { Check } from "lucide-react";
import { SimulatedChip } from "@/components/SimulatedChip";
import type { ThreadMessage } from "@/lib/types";

// Board 6: what the recipient's phone shows. Their own replies sit on the right, RollPay on the left.
// Words, dates, jobs and hours only: no pay, no phone numbers.
export function TextPreview({
  text,
  options,
  kind,
  replies = [],
  sentAt,
  timeZone,
  label,
}: {
  text: string;
  options: string[] | null;
  kind: "text" | "poll";
  replies?: ThreadMessage[];
  sentAt: string | null;
  timeZone: string;
  /** Accessible name, e.g. "Preview of the text Casey Lindqvist gets". */
  label: string;
}) {
  const stamp = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  const time = (iso: string) => stamp.format(new Date(iso));
  return (
    <figure
      aria-label={label}
      className="mx-auto w-full max-w-[18rem] rounded-[2.25rem] border bg-muted p-2 shadow-raised"
    >
      <div className="flex min-h-[26rem] flex-col overflow-hidden rounded-[1.75rem] bg-card">
        <div className="flex flex-col items-center gap-1 border-b bg-muted/50 px-4 pt-4 pb-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check aria-hidden className="size-5" strokeWidth={2.6} />
          </span>
          <span className="text-xs font-medium">RollPay</span>
          <span className="text-xs text-muted-foreground">
            iMessage · falls back to SMS
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 px-3 py-3">
          <span className="self-center pb-1 text-xs text-muted-foreground">
            {sentAt ? (
              <>
                <span className="font-semibold">Sent</span> {time(sentAt)}
              </>
            ) : (
              <span className="font-semibold">Not sent yet</span>
            )}
          </span>
          <p className="max-w-[92%] self-start rounded-[1.15rem] rounded-bl-md bg-muted px-3.5 py-2 text-[0.9375rem] leading-snug break-words whitespace-pre-wrap">
            {text || " "}
          </p>
          {kind === "poll" && options && (
            <ul
              aria-label="Poll options"
              className="flex w-[92%] flex-col self-start overflow-hidden rounded-[1.15rem] border text-sm"
            >
              {options.map((o, i) => (
                <li
                  key={o}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="size-3.5 shrink-0 rounded-full border-2 border-input"
                  />
                  <span className="text-muted-foreground">{i + 1}</span>
                  {o}
                </li>
              ))}
            </ul>
          )}
          {replies.map((m) => (
            <div key={m.id} className="flex flex-col items-end gap-1 pt-1">
              <p className="max-w-[80%] rounded-[1.15rem] rounded-br-md bg-ask px-3.5 py-2 text-[0.9375rem] leading-snug text-background">
                {m.text}
              </p>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {m.simulated && <SimulatedChip />}
                Reply {time(m.at)}
              </span>
            </div>
          ))}
        </div>

        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          One question at a time. No pay amounts.
        </p>
      </div>
    </figure>
  );
}
