"use client";

import { Check, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { AgentChip, type AgentKind } from "@/components/AgentChip";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DataLabel } from "@/components/DataLabel";
import { FlagCard } from "@/components/FlagCard";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { PrecedentBadge } from "@/components/PrecedentBadge";
import { Segmented } from "@/components/Segmented";
import { SimulatedChip } from "@/components/SimulatedChip";
import { SourceChip } from "@/components/SourceChip";
import { type Status, StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Flag } from "@/lib/types";

// Sample data: synthetic, ids only. Not from any real company.
const sampleFlag: Flag = {
  id: "styleguide-flag",
  companyId: "a",
  cycleId: "a-c05",
  checkId: "CHK-05",
  status: "open",
  subject: {
    workerId: "W05",
    jobId: "J36",
    entryIds: ["te-0141", "te-0142"],
    expenseIds: [],
  },
  seen: "W05 has two entries on Job 36 for the same 7:00–3:30 shift on Oct 17.",
  where: [
    { system: "Jobber", recordId: "te-0141", url: null },
    { system: "Jobber", recordId: "te-0142", url: null },
  ],
  confidence: "certain",
  precedent: {
    ruleId: "R-7",
    flagId: null,
    note: "precedent: rule R-7, Oct 3",
  },
  routeTo: "manager",
  affects: { workerId: "W05", jobId: "J36", dollarsCents: 34425 },
  questionId: null,
  correctionId: null,
};

const statuses: Status[] = [
  "needs-you",
  "held",
  "asked",
  "verified",
  "sync-incomplete",
  "closed",
];
const agents: AgentKind[] = [
  "analyst",
  "auditor",
  "messenger",
  "controller",
  "you",
];
const swatches = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["raised", "bg-raised"],
  ["muted", "bg-muted"],
  ["accent", "bg-accent"],
  ["primary", "bg-primary"],
  ["primary-hover", "bg-primary-hover"],
  ["border", "bg-border"],
  ["input", "bg-input"],
  ["hold-soft", "bg-hold-soft"],
  ["ask-soft", "bg-ask-soft"],
  ["ok-soft", "bg-ok-soft"],
  ["destructive-soft", "bg-destructive-soft"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function Panel({
  theme,
  companyId,
}: {
  theme: "light" | "dark";
  companyId: string;
}) {
  const [seg, setSeg] = useState<"stage1" | "stage2">("stage1");
  const [filter, setFilter] = useState<"all" | "open" | "waiting" | "done">(
    "all",
  );
  const [decided, setDecided] = useState<string | null>(null);

  return (
    <div
      data-theme={theme}
      className="grain flex min-w-0 flex-col gap-8 rounded-overlay border bg-background p-5 text-foreground lg:p-6"
    >
      <p className="text-sm font-medium text-muted-foreground">
        {theme === "light" ? "Light" : "Dark"} theme
      </p>

      <Section title="Type">
        <p className="text-[1.875rem] leading-tight font-semibold tracking-[-0.01em]">
          Page title 30
        </p>
        <p className="text-xl font-semibold">Section title 20–24</p>
        <p>Body 16 / 1.5. Second person, plain words, short sentences.</p>
        <p className="text-sm text-muted-foreground">
          Supporting label 14, secondary text
        </p>
        <p className="tabular-nums">
          0123456789 · <Money cents={128450} /> · <Money cents={-34425} /> ·{" "}
          <Money cents={34425} signed />
        </p>
        <div className="grid w-fit grid-cols-[auto_auto] gap-x-6 rounded-control bg-card p-3 text-right tabular-nums shadow-card">
          <span className="text-left text-muted-foreground">Regular</span>
          <Money cents={1672375} />
          <span className="text-left text-muted-foreground">Overtime</span>
          <Money cents={57375} />
          <span className="text-left text-muted-foreground">Commission</span>
          <Money cents={148600} />
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {swatches.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1 text-xs">
              <span className={`h-10 rounded-control border ${cls}`} />
              <span className="text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <Row>
          <Button>Approve and send</Button>
          <Button variant="secondary">Edit</Button>
          <Button variant="quiet">Deny</Button>
          <Button variant="destructive">Delete entry</Button>
        </Row>
        <Row>
          <Button size="sm">
            <Check /> Approve
          </Button>
          <Button size="lg">
            <Send /> Fill Gusto draft
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" size="icon" aria-label="Send">
            <Send />
          </Button>
        </Row>
        <p className="text-sm text-muted-foreground">
          Draft only. PayrollPilot never submits payroll.
        </p>
      </Section>

      <Section title="Status (word + icon, never color alone)">
        <Row>
          {statuses.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </Row>
        <Row>
          <StatusBadge status="asked" label="Waiting on manager" />
          <StatusBadge status="verified" label="Fixed" />
        </Row>
      </Section>

      <Section title="Provenance and rubric badges">
        <Row>
          <DataLabel kind="synthetic" />
          <DataLabel kind="synthetic" detail="Company A, cycle 5" />
          <DataLabel kind="real, anonymized" />
          <SimulatedChip />
        </Row>
        <Row>
          <ConfidenceBadge confidence="certain" />
          <ConfidenceBadge confidence={0.72} />
          <ConfidenceBadge confidence={0.9} />
          <PrecedentBadge precedent={null} companyId={companyId} />
          <PrecedentBadge
            precedent={sampleFlag.precedent}
            companyId={companyId}
          />
        </Row>
        <Row>
          <SourceChip system="Jobber" recordId="te-0141" />
          <SourceChip
            system="QuickBooks"
            recordId="purchase-118"
            url="https://example.com/record"
          />
          <SourceChip system="Gusto" recordId="emp-07" />
          <SourceChip system="Workbook" recordId="line-W05" />
        </Row>
        <Row>
          {agents.map((a) => (
            <AgentChip key={a} agent={a} />
          ))}
          <AgentChip agent="manager" label="Manager · W12" />
        </Row>
        <Row>
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="brand">brand</Badge>
          <Badge tone="hold">hold</Badge>
          <Badge tone="ask">ask</Badge>
          <Badge tone="ok">ok</Badge>
          <Badge tone="error">error</Badge>
          <Badge tone="ask" variant="outline">
            outline
          </Badge>
        </Row>
      </Section>

      <Section title="Segmented and tabs">
        <Segmented
          label="Stage"
          value={seg}
          onValueChange={setSeg}
          options={[
            { value: "stage1", label: "Stage 1 · Wages" },
            { value: "stage2", label: "Stage 2 · Commissions" },
          ]}
        />
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
        >
          <TabsList>
            <TabsTrigger value="all">All 9</TabsTrigger>
            <TabsTrigger value="open">Open 3</TabsTrigger>
            <TabsTrigger value="waiting">Waiting on reply 3</TabsTrigger>
            <TabsTrigger value="done">Resolved 3</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="text-sm text-muted-foreground">
            Panel for “{filter}”.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Stage 1 · Wages</CardTitle>
            <CardDescription>10 of 12 workers ready</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            <Money cents={1672375} />{" "}
            <span className="text-sm font-normal text-muted-foreground">
              so far · Workbook · synthetic
            </span>
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            Two workers wait on the manager’s answers.
          </CardFooter>
        </Card>
      </Section>

      <Section title="FlagCard · owner">
        <FlagCard
          flag={sampleFlag}
          dataKind="synthetic"
          viewerRole="owner"
          headline="W05 clocked in twice on Fri, Oct 17. Ask the manager which is right?"
          affectsLabel="Wages"
          agents={["auditor", "messenger"]}
          approveLabel="Approve and send"
          onApprove={() => setDecided("approved")}
          onEdit={() => setDecided("edit")}
          onDeny={() => setDecided("denied")}
          href={null}
        >
          <p className="rounded-control bg-muted p-3 text-sm">
            Fri 10/17, W05, Job 36: two entries for 7:00–3:30. Which is right?
            Reply 1 if it’s one shift, 2 if there were two.
          </p>
        </FlagCard>
        {decided && (
          <p className="text-sm text-muted-foreground">
            Styleguide only: “{decided}” clicked. Nothing was sent.
          </p>
        )}
      </Section>

      <Section title="FlagCard · manager (no dollars)">
        <FlagCard
          flag={{ ...sampleFlag, status: "asked" }}
          dataKind="synthetic"
          viewerRole="manager"
          affectsLabel="Wages"
          agents={["auditor"]}
          detailsOpen
          href={null}
        />
      </Section>

      <Section title="Sheet and dialog">
        <Row>
          <Sheet>
            <SheetTrigger render={<Button variant="secondary" />}>
              Open sheet
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Approve this text?</SheetTitle>
                <SheetDescription>
                  Solid body, frosted surrounding layer.
                </SheetDescription>
              </SheetHeader>
              <p className="mx-5 rounded-control bg-muted p-3 text-sm">
                Fri 10/17, W05, Job 36: two entries for 7:00–3:30. Which is
                right?
              </p>
              <SheetFooter>
                <Button>Approve and send</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" />}>
              Open dialog
            </DialogTrigger>
            <DialogContent scrim="plain">
              <DialogHeader>
                <DialogTitle>Approve Gate 1?</DialogTitle>
                <DialogDescription>
                  Then we fill the Gusto draft. Draft only. PayrollPilot never
                  submits payroll.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="secondary" />}>
                  Not yet
                </DialogClose>
                <DialogClose render={<Button />}>Approve Gate 1</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>
      </Section>

      <Section title="Materials">
        <div className="relative h-28 overflow-hidden rounded-card border bg-accent">
          <div className="absolute inset-x-6 top-6 h-24 rounded-card bg-primary/70" />
          <div className="frosted absolute inset-x-3 bottom-3 rounded-control border p-3 text-sm">
            Frosted surface over color, with an opaque fallback.
          </div>
        </div>
      </Section>
    </div>
  );
}

export function Styleguide() {
  const { companyId } = useParams<{ companyId: string }>();
  return (
    <>
      <PageHeader
        title="Styleguide"
        description="Every shared component in both themes. Dev only, not in the nav. Sample data is synthetic."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel theme="light" companyId={companyId} />
        <Panel theme="dark" companyId={companyId} />
      </div>
    </>
  );
}
