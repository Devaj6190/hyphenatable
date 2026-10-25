"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  AppMark,
  FoundIn,
  Initials,
  StatusDot,
} from "@/components/company/bits";
import { type DataKind, DataLabel } from "@/components/DataLabel";
import { useRole } from "@/components/RoleProvider";
import { PlainRuleBox } from "@/components/rules/PlainRuleBox";
import { RuleCard } from "@/components/rules/RuleCard";
import { PreviewNote, RulesEmpty } from "@/components/rules/RulesBits";
import { SetupSteps } from "@/components/rules/SetupSteps";
import { SourceChip } from "@/components/SourceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { routes } from "@/lib/routes";
import { useRuleStore } from "@/lib/ruleStore";
import { closedOf, groupRules, shortDate, syncWords } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { MissedQuestion, RulesViewData } from "@/lib/view-types";
import type { CompanyViewData } from "@/lib/view-types/company";

// Onboarding V3: one guided step at a time with a step rail. Fixture only: connecting apps and reading history
// are not live, so those steps show what the fixtures already hold. Every decision goes through ruleStore
// (session only) until the onboarding and rules functions land.

function MissedCard({
  q,
  store,
  canAnswer,
  by,
}: {
  q: MissedQuestion;
  store: ReturnType<typeof useRuleStore>;
  canAnswer: boolean;
  by: string;
}) {
  const saved = store.answers[q.id];
  const [choice, setChoice] = useState(saved?.choice ?? "");
  const [note, setNote] = useState(saved?.note ?? "");
  const [editing, setEditing] = useState(!saved);
  const name = useId();
  return (
    <article className="rounded-card border bg-card p-4 shadow-card sm:p-5">
      <p className="text-[1.0625rem] leading-snug font-medium text-pretty">
        {q.text}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        From
        {q.evidence.map((id) => (
          <SourceChip key={id} system="Gusto" recordId={id} />
        ))}
      </div>
      {saved && !editing ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="closed" label="Answered" />
            <span className="font-medium">{saved.choice}</span>
            {canAnswer && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setEditing(true)}
                className="ml-auto"
              >
                Change
              </Button>
            )}
          </div>
          {saved.note && <p className="text-sm">“{saved.note}”</p>}
          <p className="text-sm text-muted-foreground">
            Saved {shortDate(saved.at)}. The Analyst turns this into a proposed
            rule. You answered it, so someone else approves that rule.
          </p>
        </div>
      ) : canAnswer ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!choice) return;
            store.answer(q.id, { choice, note: note.trim(), by });
            setEditing(false);
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Your answer</legend>
            {q.options.map((o) => (
              <label
                key={o}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-(--dur-hover) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  choice === o
                    ? "border-primary-edge bg-accent text-link"
                    : "border-input hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={o}
                  checked={choice === o}
                  onChange={() => setChoice(o)}
                  className="sr-only"
                />
                {o}
              </label>
            ))}
          </fieldset>
          <Textarea
            aria-label="Anything to add (optional)"
            placeholder="Anything to add (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-12 bg-card"
            maxLength={400}
          />
          <div>
            <Button type="submit" size="sm" disabled={!choice}>
              Save answer
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Only the owner answers these.
        </p>
      )}
    </article>
  );
}

/** A step's heading block: eyebrow, title, one sentence. */
function StepHead({
  eyebrow,
  title,
  description,
  as: H = "h2",
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold tracking-wider text-link">
        {eyebrow}
      </span>
      <H
        className={cn(
          "leading-tight font-semibold tracking-[-0.01em] text-balance",
          H === "h1" ? "text-[2rem]" : "text-[1.625rem]",
        )}
      >
        {title}
      </H>
      {description && (
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** Counts up to the real totals once, so the history read feels like a read. Instant under reduced motion. */
function useCountUp(active: boolean, ms = 1400) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / ms);
      setT(1 - (1 - x) ** 3);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ms]);
  return t;
}

const APPS = [
  {
    id: "jobber",
    mark: "jobber",
    name: "Jobber",
    what: "Hours, jobs, visits, quotes, invoices, expenses",
    scope: "Read-only · no write access",
  },
  {
    id: "qbo",
    mark: "qbo",
    name: "QuickBooks",
    what: "Purchases, bills, accounts",
    scope: "Read-only",
  },
  {
    id: "gusto",
    mark: "gusto",
    name: "Gusto",
    what: "People, rates, past payrolls, drafts",
    scope: "Can fill drafts · can never submit",
  },
] as const;

export function OnboardingView({
  companyId,
  companyName,
  dataKind,
  label,
  data,
  company,
}: {
  companyId: string;
  companyName: string;
  dataKind: DataKind;
  label: string;
  data: RulesViewData;
  company: CompanyViewData;
}) {
  const { role } = useRole();
  const store = useRuleStore(companyId, data.rules);
  const owner = data.ownerId;
  const approverId = role === "owner" ? owner : null;
  const [step, setStep] = useState(0);
  const scan = useCountUp(step === 2);

  const past = closedOf(data.cycles);
  const learned = store.rules.filter((r) => r.source !== "owner_stated");
  const stated = store.rules.filter((r) => r.source === "owner_stated");
  const checked = learned.filter((r) => r.status !== "proposed").length;
  const questions = data.missedQuestions;
  const gaps = data.incompleteSyncs;
  const facts = company.settings;
  const factKey = (id: string) => `fact:${companyId}:${id}`;
  const factsDone = facts.filter((f) => store.answers[factKey(f.id)]).length;
  const answered = questions.filter((q) => store.answers[q.id]).length;
  const lookCount = company.people.filter((p) => p.needsLook).length;
  const connected = APPS.filter((a) => data.connected[a.id]).length;
  const firstName = (owner && data.names[owner]?.split(" ")[0]) || "there";

  if (!learned.length && !company.people.length)
    return <RulesEmpty label={label} />;

  const steps = [
    { title: "Welcome", sub: "What RollPay does", done: null },
    {
      title: "Connect apps",
      sub: "Jobber, QuickBooks, Gusto",
      done: connected === APPS.length,
    },
    {
      title: "Read your history",
      sub: `${company.history.cycles} past payrolls`,
      done: null,
    },
    {
      title: "How payroll works",
      sub: "Schedule, overtime, checks",
      done: facts.length > 0 && factsDone === facts.length,
    },
    {
      title: "Match your people",
      sub: `${company.people.length} people`,
      done: null,
    },
    {
      title: "Rules from history",
      sub: `${learned.length} proposed`,
      done: learned.length > 0 && checked === learned.length,
    },
    {
      title: "What did we miss?",
      sub: `${questions.length} question${questions.length === 1 ? "" : "s"}`,
      done: questions.length > 0 && answered === questions.length,
    },
    { title: "Your own rules", sub: "In plain words", done: null },
    { title: "Ready", sub: "Run your first payroll", done: null },
  ];
  const last = steps.length - 1;
  const of = `STEP ${step} OF ${last - 1}`;
  const go = (i: number) => {
    setStep(Math.max(0, Math.min(last, i)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nav = (next = "Continue") => (
    <div className="flex flex-wrap items-center gap-3 border-t pt-5">
      <Button onClick={() => go(step + 1)}>{next} ›</Button>
      {step > 0 && (
        <Button variant="ghost" onClick={() => go(step - 1)}>
          Back
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <aside className="hidden rounded-card border bg-card p-3 shadow-card lg:sticky lg:top-4 lg:block">
        <SetupSteps steps={steps} current={step} onSelect={go} />
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {/* Phone: the rail becomes a progress line. */}
        <div className="flex flex-col gap-2 lg:hidden">
          <span className="text-sm font-semibold">
            Step {Math.min(step, last - 1)} of {last - 1} · {steps[step].title}
          </span>
          <span
            aria-hidden
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-sunset transition-[width] duration-(--dur-archive) ease-out-soft"
              style={{ width: `${(step / last) * 100}%` }}
            />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DataLabel kind={dataKind} detail={`${label}, onboarding`} />
          <span className="text-sm text-muted-foreground">
            Fixture data · rules: {data.sources.rules}
          </span>
        </div>

        <section
          key={step}
          aria-label={steps[step].title}
          className="flex animate-in flex-col gap-5 duration-(--dur-tab) ease-out-soft fade-in slide-in-from-bottom-2"
        >
          {step === 0 && (
            <>
              <StepHead
                as="h1"
                eyebrow={`WELCOME, ${firstName.toUpperCase()}`}
                title={`Let’s learn how ${companyName} runs payroll`}
                description={`We connect your apps, read your last ${company.history.cycles || "few"} payrolls, and propose the rules you already follow. You confirm everything.`}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Read-only", "We never change Jobber or QuickBooks."],
                  ["You approve", "Nothing becomes a rule until you say so."],
                  ["Never submits", "We fill Gusto drafts. You submit."],
                ].map(([t, d]) => (
                  <div
                    key={t}
                    className="flex flex-col gap-1 rounded-card border bg-card p-4 shadow-card"
                  >
                    <ShieldCheck aria-hidden className="size-5 text-link" />
                    <span className="font-bold">{t}</span>
                    <span className="text-sm text-muted-foreground">{d}</span>
                  </div>
                ))}
              </div>
              <p className="max-w-2xl rounded-card bg-accent p-4 text-sm">
                <span className="font-semibold">We do this with you.</span>{" "}
                Setup is usually a short call with the RollPay team. You can
                also run it on your own.
              </p>
              {nav("Get started")}
            </>
          )}

          {step === 1 && (
            <>
              <StepHead
                eyebrow={of}
                title="Connect your apps"
                description="Read access only. You can disconnect any time."
              />
              <div className="flex flex-col gap-3">
                {APPS.map((a) => {
                  const on = data.connected[a.id];
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center gap-4 rounded-card border bg-card p-4 shadow-card",
                        on && "border-ok/40",
                      )}
                    >
                      <AppMark app={a.mark} size="lg" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-bold">{a.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {a.what}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.scope}
                        </span>
                      </span>
                      {on ? (
                        <StatusBadge status="verified" label="Connected" />
                      ) : (
                        <span className="text-right text-sm text-muted-foreground">
                          Not connected
                          <br />
                          <span className="text-xs">
                            Connecting is not live yet
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Connected means a sync run is on record for this company. No API
                access? The Jobber Timesheets export, QuickBooks Export to Excel
                or the Gusto Payroll Journal work too.
              </p>
              {nav(connected === APPS.length ? "Read my history" : "Continue")}
            </>
          )}

          {step === 2 && (
            <>
              <StepHead
                eyebrow={`${of} · READING YOUR HISTORY`}
                title={
                  scan < 1
                    ? "Reading your past payrolls…"
                    : `Read ${company.history.cycles} past payrolls${company.history.period ? ` (${company.history.period})` : ""}`
                }
              />
              <span
                aria-hidden
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${scan * 100}%` }}
                />
              </span>
              <div className="grid gap-3 sm:grid-cols-3">
                {company.history.reads.map((r) => (
                  <div
                    key={r.label}
                    className="flex flex-col gap-1 rounded-card border bg-card p-4 shadow-card"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <AppMark app={r.system} />
                      {r.label}
                    </span>
                    <span className="text-2xl font-bold tabular-nums">
                      {Math.round(scan * r.pulled)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        scan < 1
                          ? "text-link"
                          : r.complete
                            ? "text-ok"
                            : "text-destructive",
                      )}
                    >
                      {scan < 1 ? "Reading…" : r.detail}
                    </span>
                  </div>
                ))}
              </div>
              {company.history.reads.length === 0 && (
                <p className="text-muted-foreground">
                  No past payrolls on record for {label}.
                </p>
              )}
              {gaps.map((g) => (
                <div
                  key={g.id}
                  className="flex max-w-2xl flex-wrap items-center gap-2 rounded-control border border-destructive/40 bg-destructive-soft p-3 text-sm"
                >
                  <StatusBadge status="sync-incomplete" label={syncWords(g)} />
                  <span>
                    Cycle {past.find((c) => c.id === g.cycleId)?.number} is
                    still used as evidence, marked incomplete. Nothing was
                    filled in.
                  </span>
                </div>
              ))}
              <p className="flex max-w-2xl items-start gap-2 rounded-card border bg-card p-4 text-sm">
                <ShieldCheck
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-link"
                />
                <span>
                  <span className="font-semibold">Privacy:</span> people and
                  client names are swapped for IDs before the AI sees anything.
                  Pay amounts never go in a text.
                </span>
              </p>
              {nav(scan < 1 ? "Skip ahead" : "See what we found")}
            </>
          )}

          {step === 3 && (
            <>
              <StepHead
                eyebrow={of}
                title="Here’s how your payroll works"
                description="From your company settings and the rules found in past payrolls. Confirm each, or change it later in Company → Profile."
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {facts.map((f) => {
                  const ok = !!store.answers[factKey(f.id)];
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "flex flex-col gap-2 rounded-card border bg-card p-4 shadow-card",
                        ok && "border-ok/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                          {f.label}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2 text-[11px] font-extrabold",
                            ok ? "bg-ok-soft text-ok" : "bg-accent text-link",
                          )}
                        >
                          {ok ? "Confirmed" : "Found"}
                        </span>
                      </div>
                      <span className="text-[17px] font-bold">{f.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.source}
                      </span>
                      {!ok && approverId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="self-start"
                          onClick={() =>
                            store.answer(factKey(f.id), {
                              choice: "confirmed",
                              note: "",
                              by: approverId,
                            })
                          }
                        >
                          That’s right
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t pt-5">
                <Button onClick={() => go(step + 1)}>Continue ›</Button>
                {approverId && factsDone < facts.length && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      for (const f of facts)
                        if (!store.answers[factKey(f.id)])
                          store.answer(factKey(f.id), {
                            choice: "confirmed",
                            note: "",
                            by: approverId,
                          });
                    }}
                  >
                    Confirm all {facts.length - factsDone}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => go(step - 1)}>
                  Back
                </Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <StepHead
                eyebrow={of}
                title="Match your people across apps"
                description={`${company.people.length - lookCount} matched on their own. ${lookCount === 0 ? "None need" : lookCount === 1 ? "1 needs" : `${lookCount} need`} a look; fix them in Company → People, or on Home when payroll runs.`}
              />
              <ul className="overflow-hidden rounded-card border bg-card shadow-card">
                {company.people.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0"
                  >
                    <Initials text={p.initials} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">
                        {p.displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {p.roleLabel}
                      </span>
                    </span>
                    <span className="hidden sm:flex">
                      <FoundIn foundIn={p.foundIn} />
                    </span>
                    {p.pay && (
                      <span className="hidden w-28 text-sm font-semibold tabular-nums md:block">
                        {p.pay.main}
                      </span>
                    )}
                    <StatusDot
                      tone={p.tone}
                      label={p.tone === "ready" ? "Matched" : p.label}
                      className="w-36 shrink-0"
                    />
                  </li>
                ))}
              </ul>
              <Link
                href={routes.company(companyId, "people")}
                className="text-sm font-semibold text-link underline-offset-4 hover:underline"
              >
                Open People in Company ›
              </Link>
              {nav("Looks right")}
            </>
          )}

          {step === 5 && (
            <>
              <StepHead
                eyebrow={of}
                title="Rules we found in your past payrolls"
                description={`Each was checked against your ${past.length} past payrolls. ${checked} of ${learned.length} checked. We only use rules you confirm, and checks never change pay on their own.`}
              />
              <PreviewNote />
              {/* No bulk confirm: model confidence is not a reason to approve a rule unread. */}
              {groupRules(learned).map((g) => (
                <div key={g.id} className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {g.title}
                  </h3>
                  {g.rules.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      names={data.names}
                      store={store}
                      viewer={role}
                      approverId={approverId}
                      approveLabel="Confirm"
                    />
                  ))}
                </div>
              ))}
              {nav()}
            </>
          )}

          {step === 6 && (
            <>
              <StepHead
                eyebrow={of}
                title="What did we miss?"
                description="We couldn’t work these out from history. One question each; nothing changes until you approve a rule."
              />
              <p className="-mt-2 text-sm text-muted-foreground">
                {approverId
                  ? `Questions: ${data.sources.missed}`
                  : "These questions go to the owner."}
              </p>
              {questions.map((q) => (
                <MissedCard
                  key={q.id}
                  q={q}
                  store={store}
                  canAnswer={approverId !== null}
                  by={approverId ?? ""}
                />
              ))}
              {questions.length === 0 && (
                <p className="text-muted-foreground">Nothing to ask.</p>
              )}
              {nav()}
            </>
          )}

          {step === 7 && (
            <>
              <StepHead
                eyebrow={of}
                title="Anything else we should know?"
                description="Type a rule in your own words. We restate it, label it as yours, and check it against your past payrolls."
              />
              {approverId && (
                <div className="rounded-card border bg-card p-4 shadow-card sm:p-5">
                  <PlainRuleBox
                    onSubmit={(text) => store.addStated(text, null)}
                  />
                </div>
              )}
              {stated.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    We read your rules as
                  </h3>
                  {stated.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      names={data.names}
                      store={store}
                      viewer={role}
                      approverId={approverId}
                      approveLabel="Confirm"
                    />
                  ))}
                </div>
              )}
              {nav("Finish setup")}
            </>
          )}

          {step === 8 && (
            <div className="flex flex-col gap-5 rounded-card border bg-card p-6 shadow-card">
              <span aria-hidden className="h-1.5 w-24 rounded-full bg-sunset" />
              <StepHead
                eyebrow="READY"
                title={`RollPay knows how ${companyName} runs payroll`}
                description="RollPay learns from every answer, so each payroll asks fewer questions."
              />
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  [connected, "apps connected"],
                  [factsDone, "facts confirmed"],
                  [
                    store.rules.filter((r) => r.status === "active").length,
                    "rules approved",
                  ],
                  [
                    company.people.filter((p) => !p.needsLook).length,
                    "people matched",
                  ],
                ].map(([n, what]) => (
                  <div key={what} className="flex flex-col">
                    <dd className="order-first text-3xl font-bold tabular-nums">
                      {n}
                    </dd>
                    <dt className="text-sm text-muted-foreground">{what}</dt>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={routes.home(companyId)}
                  className={buttonVariants()}
                >
                  Run your first payroll ›
                </Link>
                <Link
                  href={routes.company(companyId, "rules")}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  See rules in Company
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Fixture preview: these choices stay in this browser tab until
                the onboarding functions are live.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
