import { must } from "./must";
// Jobber seed plan: which mutations push a company's fixtures into the allowlisted Jobber seed account, in order.
// Pure: no network, no tokens. seed/push-jobber.ts prints the plan (dry run) or executes it (live).
//
// Mutation and field NAMES are verified by introspection (docs/sources/research/jobber.md section 4).
// Input SHAPES marked UNVERIFIED must be checked once in GraphiQL on the seed app (never the read app)
// before the first live batch; a wrong shape comes back as a GraphQL error or userErrors and stops the run.
//
// Every created record carries our marker `payrollpilot:<ourId>` (in a note, title or subject) so a rerun
// can find it; the id map lives in data/private/<company>-jobber-map.json (gitignored).

export type Rec = Record<string, unknown>;
export type Fixtures = Record<
  | "workers"
  | "timeEntries"
  | "jobs"
  | "visits"
  | "quotes"
  | "invoices"
  | "payments"
  | "expenses",
  Rec[]
>;

/** Kinds of objects we create, in dependency order. */
export const OBJECTS = [
  "clients",
  "properties",
  "quotes",
  "jobs",
  "visits",
  "visitCompletes",
  "entries",
  "expenses",
  "invoices",
  "payments",
] as const;
export type ObjectKind = (typeof OBJECTS)[number] | "users";
/** What live mode left out because the token's schema has no mutation for it (recorded in the id map). */
export type SkipRecord = {
  checkedAt: string;
  accountId: string;
  objects: Record<
    string,
    { mutations: string[]; count: number; reason: string }
  >;
};
export type IdMap = Partial<Record<ObjectKind, Record<string, string>>> & {
  skipped?: SkipRecord;
};

/** A value filled from the id map at execution time. */
export type Ref = { $ref: `${ObjectKind}:${string}` };
export const ref = (kind: ObjectKind, ourId: string): Ref => ({
  $ref: `${kind}:${ourId}`,
});

export type Step = {
  object: (typeof OBJECTS)[number];
  ourId: string;
  marker: string;
  mutation: keyof typeof MUTATIONS;
  variables: Rec;
  /** JSON path of the created id in the payload, e.g. "clientCreate.client.id". */
  idPath: string | null;
  note?: string;
};

export const marker = (ourId: string) => `payrollpilot:${ourId}`;
const dollars = (cents: number) => Math.round(cents) / 100;

// ---------------------------------------------------------------- documents

// Live introspection (read app, version 2026-09-25, Sat 2026-10-24 ~03:00) VERIFIED the argument and input
// shapes of the mutations marked LIVE below. NOT IN THE LIVE SCHEMA: timeSheetEntryCreate, invoiceCreateFromJob,
// invoiceCreatePaymentRecord, quoteCreatePaymentRecord (the earlier names came from an unauthenticated schema
// dump that included internal fields). Live mode checks every mutation it needs before writing anything.
export const MUTATIONS = {
  // LIVE: clientCreate(input: ClientCreateInput!) { companyName, isCompany, ... }
  clientCreate: `mutation($input: ClientCreateInput!) { clientCreate(input: $input) { client { id } userErrors { message path } } }`,
  // LIVE: propertyCreate(clientId!, input: { properties: [{ address: { street1, ... }! }] })
  propertyCreate: `mutation($clientId: EncodedId!, $input: PropertyCreateInput!) { propertyCreate(clientId: $clientId, input: $input) { properties { id } userErrors { message path } } }`,
  // LIVE: quoteCreate(attributes: { clientId!, propertyId!, lineItems! [{ name!, saveToProductsAndServices!, unitPrice, quantity }], salespersonId, title })
  quoteCreate: `mutation($attributes: QuoteCreateAttributes!) { quoteCreate(attributes: $attributes) { quote { id quoteNumber } userErrors { message path } } }`,
  // LIVE: jobCreate(input: { propertyId!, invoicing! { invoicingType: FIXED_PRICE|VISIT_BASED, invoicingSchedule: ON_COMPLETION|... }, quoteId, salespersonId, title, lineItems [{ name!, saveToProductsAndServices!, unitPrice!, quantity! }] })
  jobCreate: `mutation($input: JobCreateAttributes!) { jobCreate(input: $input) { job { id jobNumber } userErrors { message path } } }`,
  // LIVE: visitCreate(jobId!, input: { visits: [{ title, schedule: { startAt/endAt: { date!, time, timezone! }, teamMemberIdsToAssign } }] })
  visitCreate: `mutation($jobId: EncodedId!, $input: VisitCreateInput!) { visitCreate(jobId: $jobId, input: $input) { createdVisits { id } userErrors { message path } } }`,
  // LIVE: visitComplete(visitId!, input: { completedAt })
  visitComplete: `mutation($visitId: EncodedId!) { visitComplete(visitId: $visitId) { visit { id isComplete } userErrors { message path } } }`,
  // NOT IN THE LIVE SCHEMA. Kept so the plan shows what time entries need; live mode stops before any write.
  timeSheetEntryCreate: `mutation($input: TimeSheetEntryCreateInput!) { timeSheetEntryCreate(input: $input) { timeSheetEntry { id } userErrors { message path } } }`,
  // LIVE: expenseCreate(input: { title!, date!, total, description, reimbursableToId, linkedJobId, accountingCodeId })
  expenseCreate: `mutation($input: ExpenseCreateInput!) { expenseCreate(input: $input) { expense { id } userErrors { message path } } }`,
  // NOT IN THE LIVE SCHEMA (invoiceCreate exists: clientId!, dueDetails!, tax!, lineItems!, jobIds; not wired yet).
  // LIVE (seed token): invoiceCreate(input: { clientId!, propertyId, jobIds, subject, issuedDate, markSent, dueDetails! { dueDate, invoiceNet }, tax! { taxCalculationMethod: EXCLUSIVE|INCLUSIVE }, lineItems! [{ name!, quantity, unitPrice }] })
  invoiceCreate: `mutation($input: InvoiceCreateInput!) { invoiceCreate(input: $input) { invoice { id invoiceNumber } userErrors { message path } } }`,
  // LIVE (seed token): jobEdit(jobId!, input: { title, ... }) and expenseEdit(expenseId!, input: { title, ... }); used by --retitle only
  jobEdit: `mutation($jobId: EncodedId!, $input: JobEditInput!) { jobEdit(jobId: $jobId, input: $input) { job { id title } userErrors { message path } } }`,
  expenseEdit: `mutation($expenseId: EncodedId!, $input: ExpenseEditInput!) { expenseEdit(expenseId: $expenseId, input: $input) { expense { id title } userErrors { message path } } }`,
  // NOT IN THE LIVE SCHEMA.
  invoiceCreatePaymentRecord: `mutation($input: InvoiceCreatePaymentRecordInput!) { invoiceCreatePaymentRecord(input: $input) { paymentRecord { id } userErrors { message path } } }`,
  // NOT IN THE LIVE SCHEMA.
  quoteCreatePaymentRecord: `mutation($input: QuoteCreatePaymentRecordInput!) { quoteCreatePaymentRecord(input: $input) { paymentRecord { id } userErrors { message path } } }`,
} as const;

/** Read-only lookups used before writing (idempotency and safety). */
export const QUERIES = {
  // LIVE: Account has no `tester` field (and User has no labourRate, Expense no accountingCode).
  account: `query { account { id name } }`,
  mutationNames: `query { __type(name: "Mutation") { fields { name } } }`,
  invoices: `query($after: String) { invoices(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id subject } pageInfo { hasNextPage endCursor } } }`,
  users: `query($status: UsersStatusFilterEnum!, $after: String) { users(filter: { status: $status }, first: 50, after: $after) { nodes { id name { full } status } pageInfo { hasNextPage endCursor } } }`,
  // note is read only to find our marker; it is never stored.
  // read only, for --adopt-entries: hand-entered entries carry no marker, so they are matched by user, job and start
  entriesForAdopt: `query($after: String, $from: ISO8601DateTime!, $to: ISO8601DateTime!) { timeSheetEntries(filter: { startAt: { after: $from, before: $to } }, first: 50, after: $after) { nodes { id startAt ticking finalDuration timeSheetCategory createdAt user { id } job { id } } pageInfo { hasNextPage endCursor } } }`,
  entries: `query($after: String, $from: ISO8601DateTime!, $to: ISO8601DateTime!) { timeSheetEntries(filter: { startAt: { after: $from, before: $to } }, first: 50, after: $after) { nodes { id note } pageInfo { hasNextPage endCursor } } }`,
  jobs: `query($after: String) { jobs(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
  expenses: `query($after: String) { expenses(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
  clients: `query($after: String) { clients(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id companyName } pageInfo { hasNextPage endCursor } } }`,
  quotes: `query($after: String) { quotes(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
} as const;

// ---------------------------------------------------------------- plan

const PAYMENT_TYPE: Record<string, string> = {
  credit_card: "CREDIT_CARD",
  check: "CHECK",
  ach: "BANK_TRANSFER",
  cash: "CASH",
};

export type PlanResult = {
  steps: Step[];
  skipped: { object: string; ourId: string; reason: string }[];
  manual: { before: string[]; after: string[] };
};

/** Builds the ordered step list. Steps whose ourId is already in `map` are left out (idempotent rerun). */
/** ISO UTC -> Jobber LocalDateTimeAttributes { date, time, timezone } in the company's zone. */
export function localDateTime(
  iso: string,
  timezone: string,
): { date: string; time: string; timezone: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    timezone,
  };
}

export function buildPlan(
  fx: Fixtures,
  map: IdMap,
  opts: { currentCycleId: string; companyName: string; timezone: string },
): PlanResult {
  const steps: Step[] = [];
  const skipped: PlanResult["skipped"] = [];
  const have = (k: ObjectKind, id: string) => !!map[k]?.[id];
  const push = (s: Omit<Step, "marker">) => {
    if (have(s.object, s.ourId)) return;
    steps.push({ ...s, marker: marker(s.ourId) });
  };

  const jobs = new Map(fx.jobs.map((j) => [j.id as string, j]));
  const streetOf = (j: Rec) => String(j.title).split(" - ").at(-1) as string;

  // clients and properties: one each per clientRef (fake labels, no person names)
  const clients = [
    ...new Set(fx.jobs.map((j) => j.clientRef as string)),
  ].sort();
  for (const c of clients) {
    push({
      object: "clients",
      ourId: c,
      mutation: "clientCreate",
      idPath: "clientCreate.client.id",
      variables: {
        input: {
          companyName: `${opts.companyName} client ${c} [${marker(c)}]`,
        },
      },
    });
  }
  for (const c of clients) {
    const first = must(fx.jobs.find((j) => j.clientRef === c));
    push({
      object: "properties",
      ourId: c,
      mutation: "propertyCreate",
      idPath: "propertyCreate.properties.0.id",
      variables: {
        clientId: ref("clients", c),
        input: { properties: [{ address: { street1: streetOf(first) } }] },
      },
    });
  }

  // quotes before jobs, so jobCreate can link quoteId
  for (const q of fx.quotes) {
    const job = q.jobId ? jobs.get(q.jobId as string) : null;
    const clientRef = (job?.clientRef as string) ?? clients[0];
    push({
      object: "quotes",
      ourId: q.id as string,
      mutation: "quoteCreate",
      idPath: "quoteCreate.quote.id",
      variables: {
        attributes: {
          clientId: ref("clients", clientRef),
          propertyId: ref("properties", clientRef),
          title: `${job ? job.title : "Quote"} [${marker(q.id as string)}]`,
          salespersonId: q.salespersonWorkerId
            ? ref("users", q.salespersonWorkerId as string)
            : null,
          lineItems: [
            {
              name: job ? String(job.title) : "Landscape work",
              saveToProductsAndServices: false,
              quantity: 1,
              unitPrice: dollars(q.amountCents as number),
            },
          ],
        },
      },
      note:
        q.status === "converted"
          ? undefined
          : `status ${q.status}: left as created (no transition)`,
    });
  }

  for (const j of fx.jobs) {
    push({
      object: "jobs",
      ourId: j.id as string,
      mutation: "jobCreate",
      idPath: "jobCreate.job.id",
      variables: {
        input: {
          propertyId: ref("properties", j.clientRef as string),
          title: `${j.title} [${marker(j.id as string)}]`,
          salespersonId: j.salespersonWorkerId
            ? ref("users", j.salespersonWorkerId as string)
            : null,
          quoteId: j.quoteId ? ref("quotes", j.quoteId as string) : null,
          invoicing: {
            invoicingType: "FIXED_PRICE",
            invoicingSchedule: "ON_COMPLETION",
          },
          lineItems:
            j.totalCents == null
              ? []
              : [
                  {
                    name: String(j.title),
                    saveToProductsAndServices: false,
                    quantity: 1,
                    unitPrice: dollars(j.totalCents as number),
                  },
                ],
        },
      },
      note: j.parentJobId
        ? `sub-job of ${j.parentJobId} (Jobber has no parent link; the street in the title is the hint)`
        : undefined,
    });
  }

  for (const v of fx.visits) {
    push({
      object: "visits",
      ourId: v.id as string,
      mutation: "visitCreate",
      idPath: "visitCreate.createdVisits.0.id",
      variables: {
        jobId: ref("jobs", v.jobId as string),
        input: {
          visits: [
            {
              title: marker(v.id as string),
              schedule: {
                startAt: localDateTime(v.startAt as string, opts.timezone),
                endAt: v.endAt
                  ? localDateTime(v.endAt as string, opts.timezone)
                  : null,
                teamMemberIdsToAssign: (v.assignedWorkerIds as string[]).map(
                  (w) => ref("users", w),
                ),
              },
            },
          ],
        },
      },
    });
  }
  for (const v of fx.visits) {
    if (!v.isComplete) continue;
    push({
      object: "visitCompletes",
      ourId: v.id as string,
      mutation: "visitComplete",
      idPath: "visitComplete.visit.id",
      variables: { visitId: ref("visits", v.id as string) },
    });
  }

  // labourRate is not sent per entry: Jobber costs entries at the user's labour rate (set in Manage Team),
  // and the fixtures only hold each worker's current rate, so sending it would rewrite past job costing.
  const workers = new Map(fx.workers.map((w) => [w.id as string, w]));
  for (const e of fx.timeEntries) {
    const id = e.id as string;
    if (e.ticking) {
      skipped.push({
        object: "entries",
        ourId: id,
        reason:
          "open timer: started by hand before the pull (manual checklist)",
      });
      continue;
    }
    if (!workers.has(e.workerId as string))
      throw new Error(`entry ${id}: unknown worker ${e.workerId}`);
    const target = e.visitId
      ? { visitId: ref("visits", e.visitId as string) }
      : e.jobId
        ? { jobId: ref("jobs", e.jobId as string) }
        : {};
    push({
      object: "entries",
      ourId: id,
      mutation: "timeSheetEntryCreate",
      idPath: "timeSheetEntryCreate.timeSheetEntry.id",
      variables: {
        input: {
          startAt: e.startAt,
          duration: e.durationSec,
          userId: ref("users", e.workerId as string),
          ...target,
          note: marker(id),
        },
      },
    });
  }

  for (const x of fx.expenses) {
    if (x.source !== "jobber") continue; // QuickBooks purchases are A-06
    push({
      object: "expenses",
      ourId: x.id as string,
      mutation: "expenseCreate",
      idPath: "expenseCreate.expense.id",
      variables: {
        input: {
          title: `${x.description} [${marker(x.id as string)}]`,
          date: `${x.date}T19:00:00Z`,
          total: dollars(x.amountCents as number),
          linkedJobId: x.matchedJobId
            ? ref("jobs", x.matchedJobId as string)
            : null,
        },
      },
    });
  }

  // invoiceCreateFromJob is not in the live schema: invoiceCreate with the job linked, sent unless draft
  const noon = (d: unknown) => (d ? `${d}T16:00:00Z` : null);
  for (const i of fx.invoices) {
    const job = jobs.get(i.jobId as string);
    if (!job) throw new Error(`invoice ${i.id}: unknown job ${i.jobId}`);
    const clientRef = job.clientRef as string;
    push({
      object: "invoices",
      ourId: i.id as string,
      mutation: "invoiceCreate",
      idPath: "invoiceCreate.invoice.id",
      variables: {
        input: {
          // Live error: "Cannot set a property when jobs or visits are attached" (the job carries it).
          clientId: ref("clients", clientRef),
          jobIds: [ref("jobs", i.jobId as string)],
          subject: marker(i.id as string),
          issuedDate: noon(i.issuedDate),
          markSent: i.status !== "draft",
          dueDetails: i.dueDate ? { dueDate: noon(i.dueDate) } : {},
          tax: { taxCalculationMethod: "EXCLUSIVE" },
          lineItems: [
            {
              name: String(job.title),
              quantity: 1,
              unitPrice: dollars(i.totalCents as number),
            },
          ],
        },
      },
      note: i.status === "draft" ? "left as draft" : undefined,
    });
  }

  for (const p of fx.payments) {
    const id = p.id as string;
    if (p.paymentType === "tip") {
      skipped.push({
        object: "payments",
        ourId: id,
        reason:
          "tip: Jobber records tips on the invoice, not as a payment record; history only",
      });
      continue;
    }
    const base = {
      amount: dollars(p.amountCents as number),
      entryDate: `${p.entryDate}T19:00:00Z`,
      adjustmentType: "PAYMENT",
      paymentOrigin: "MANUAL",
      paymentDetails: {
        paymentType: PAYMENT_TYPE[p.paymentType as string] ?? "OTHER",
        details: marker(id),
      },
    };
    if (p.invoiceId) {
      // includes the CHK-19 plant: a quote deposit recorded on the invoice (reads back as "final")
      push({
        object: "payments",
        ourId: id,
        mutation: "invoiceCreatePaymentRecord",
        idPath: "invoiceCreatePaymentRecord.paymentRecord.id",
        variables: {
          input: { invoiceId: ref("invoices", p.invoiceId as string), ...base },
        },
      });
    } else if (p.quoteId) {
      push({
        object: "payments",
        ourId: id,
        mutation: "quoteCreatePaymentRecord",
        idPath: "quoteCreatePaymentRecord.paymentRecord.id",
        variables: {
          input: { quoteId: ref("quotes", p.quoteId as string), ...base },
        },
      });
    }
  }

  return { steps, skipped, manual: manualChecklists(fx, opts.currentCycleId) };
}

// ---------------------------------------------------------------- manual steps (no API for these)

export function manualChecklists(
  fx: Fixtures,
  currentCycleId: string,
): PlanResult["manual"] {
  const rate = (w: Rec) => {
    const c = (w.jobber as Rec | null)?.labourRateCents as
      | number
      | null
      | undefined;
    return c == null
      ? "no labour rate"
      : `labour rate $${(c / 100).toFixed(2)}/h`;
  };
  const byId = new Map(fx.workers.map((w) => [w.id as string, w]));
  const name = (id: string) => `${byId.get(id)?.displayName} (${id})`;
  const before = [
    "In the Jobber seed account: Settings (gear) > Manage Team > Add team member, one per worker below, with exactly this name (the pusher maps users by name). The account owner user can be renamed to the owner. If the account refuses before all are added, stop and use the reduced config (plan A-01 fallback).",
    ...fx.workers.map(
      (w) =>
        `  [ ] ${w.displayName} (${w.id}) - ${w.role}, ${rate(w)}${w.status === "inactive" ? " - keep ACTIVE until its entries exist" : ""}`,
    ),
  ];
  const cur = fx.timeEntries.filter((e) => e.cycleId === currentCycleId);
  const unapproved = cur.filter((e) => !e.approved && !e.ticking);
  const ticking = cur.filter((e) => e.ticking);
  const inactive = fx.workers.filter((w) => w.status === "inactive");
  const after = [
    "Timesheets > Approve Timesheets: approve every entry EXCEPT these (they stay unapproved for CHK-06):",
    ...unapproved.map(
      (e) =>
        `  [ ] leave unapproved: ${e.id} - ${name(e.workerId as string)}, ${e.startAt}`,
    ),
    ...ticking.map(
      (e) =>
        `Open timer (CHK-02): just before the pull, log in as ${name(e.workerId as string)} (or start it as admin) and start a timer on the job created for ${e.jobId}; leave it running. It cannot be back-dated, so its elapsed time will differ from the fixture.`,
    ),
    ...inactive.map(
      (w) =>
        `After all entries exist: Manage Team > ${name(w.id as string)} > Deactivate (CHK-08).`,
    ),
    "Then run the Jobber pull (A-03) with --compare data/fixtures/<company> and check: same entry count for the current cycle (minus the timer until it is started), approved=false on exactly the entries above, ticking=true on exactly one.",
  ];
  return { before, after };
}

/** Replaces every { $ref } in variables with the mapped Jobber id; returns missing refs instead of guessing. */
export function resolveRefs(
  v: unknown,
  map: IdMap,
  missing: string[] = [],
): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, map, missing));
  if (v && typeof v === "object") {
    if ("$ref" in v) {
      const [kind, ...rest] = String((v as Ref).$ref).split(":");
      const id = map[kind as ObjectKind]?.[rest.join(":")];
      if (!id) missing.push((v as Ref).$ref);
      return id ?? null;
    }
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== null)
        .map(([k, x]) => [k, resolveRefs(x, map, missing)]),
    );
  }
  return v;
}

/**
 * Splits the plan into what the token can create and what it cannot. A step is skipped when its mutation
 * is absent from the live schema, or when it needs a record of a skipped kind. Nothing is guessed.
 */
export function partitionSupported(
  steps: Step[],
  available: Set<string>,
): { run: Step[]; skipped: SkipRecord["objects"] } {
  const skippedKinds = new Set<string>();
  const skipped: SkipRecord["objects"] = {};
  const run: Step[] = [];
  for (const s of steps) {
    const refs: string[] = [];
    JSON.stringify(s.variables, (_, v) => {
      if (v && typeof v === "object" && "$ref" in v)
        refs.push(String(v.$ref).split(":")[0]);
      return v;
    });
    const missingMutation = !available.has(s.mutation);
    const blockedBy = refs.find((k) => skippedKinds.has(k));
    if (missingMutation || blockedBy) {
      skippedKinds.add(s.object);
      const rec = skipped[s.object] ?? { mutations: [], count: 0, reason: "" };
      skipped[s.object] = rec;
      if (!rec.mutations.includes(s.mutation)) rec.mutations.push(s.mutation);
      rec.count++;
      rec.reason = missingMutation
        ? `${s.mutation} is not in this token's schema`
        : `needs ${blockedBy}, which is skipped`;
      continue;
    }
    run.push(s);
  }
  return { run, skipped };
}

export type Retitle = {
  kind: "jobs" | "expenses";
  ourId: string;
  jobberId: string;
  from: string;
  to: string;
};

/**
 * Titles to fix: for every mapped job and Jobber expense, the title the plan would create (fixture title +
 * marker) against the title Jobber has now. Only differing titles are listed; unmapped records are ignored.
 */
export function retitlePlan(
  fullSteps: Step[],
  map: IdMap,
  current: Map<string, string>,
): Retitle[] {
  const out: Retitle[] = [];
  for (const s of fullSteps) {
    if (s.object !== "jobs" && s.object !== "expenses") continue;
    const jobberId = map[s.object]?.[s.ourId];
    if (!jobberId) continue;
    const to = String((s.variables.input as Record<string, unknown>).title);
    const from = current.get(jobberId);
    if (from === undefined || from === to) continue;
    out.push({ kind: s.object, ourId: s.ourId, jobberId, from, to });
  }
  return out;
}
