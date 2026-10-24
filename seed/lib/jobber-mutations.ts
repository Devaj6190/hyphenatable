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
  "workers" | "timeEntries" | "jobs" | "visits" | "quotes" | "invoices" | "payments" | "expenses",
  Rec[]
>;

/** Kinds of objects we create, in dependency order. */
export const OBJECTS = ["clients", "properties", "quotes", "jobs", "visits", "visitCompletes", "entries", "expenses", "invoices", "invoiceSends", "payments"] as const;
export type ObjectKind = (typeof OBJECTS)[number] | "users";
export type IdMap = Partial<Record<ObjectKind, Record<string, string>>>;

/** A value filled from the id map at execution time. */
export type Ref = { $ref: `${ObjectKind}:${string}` };
export const ref = (kind: ObjectKind, ourId: string): Ref => ({ $ref: `${kind}:${ourId}` });

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

export const MUTATIONS = {
  // UNVERIFIED input shape: ClientCreateInput fields beyond companyName.
  clientCreate: `mutation($input: ClientCreateInput!) { clientCreate(input: $input) { client { id } userErrors { message path } } }`,
  // UNVERIFIED input shape: PropertyCreateInput { properties: [{ address }] }.
  propertyCreate: `mutation($clientId: EncodedId!, $input: PropertyCreateInput!) { propertyCreate(clientId: $clientId, input: $input) { properties { id } userErrors { message path } } }`,
  // Verified: requires clientId, propertyId, lineItems; optional salespersonId. UNVERIFIED: lineItem field names.
  quoteCreate: `mutation($attributes: QuoteCreateAttributes!) { quoteCreate(attributes: $attributes) { quote { id quoteNumber } userErrors { message path } } }`,
  // Verified: requires propertyId, invoicing; optional title, salespersonId, quoteId. UNVERIFIED: invoicing enum values.
  jobCreate: `mutation($input: JobCreateAttributes!) { jobCreate(input: $input) { job { id jobNumber } userErrors { message path } } }`,
  // Verified name "visitCreate(input: { visits: [...] })". UNVERIFIED: jobId argument placement.
  visitCreate: `mutation($jobId: EncodedId!, $input: VisitCreateInput!) { visitCreate(jobId: $jobId, input: $input) { visits { id } userErrors { message path } } }`,
  visitComplete: `mutation($visitId: EncodedId!) { visitComplete(visitId: $visitId) { visit { id isComplete } userErrors { message path } } }`,
  // Verified input: { startAt!, duration, note, userId, jobId | visitId | label, labourRate }.
  timeSheetEntryCreate: `mutation($input: TimeSheetEntryCreateInput!) { timeSheetEntryCreate(input: $input) { timeSheetEntry { id } userErrors { message path } } }`,
  // Verified input: { title!, date!, total, description, reimbursableToId, linkedJobId }.
  expenseCreate: `mutation($input: ExpenseCreateInput!) { expenseCreate(input: $input) { expense { id } userErrors { message path } } }`,
  // UNVERIFIED input shape for invoiceCreateFromJob.
  invoiceCreateFromJob: `mutation($input: InvoiceCreateFromJobInput!) { invoiceCreateFromJob(input: $input) { invoice { id invoiceNumber } userErrors { message path } } }`,
  invoiceMarkAsSent: `mutation($invoiceId: EncodedId!) { invoiceMarkAsSent(invoiceId: $invoiceId) { invoice { id } userErrors { message path } } }`,
  // Verified input: { invoiceId, amount, adjustmentType!, entryDate!, paymentOrigin!, paymentDetails! }. UNVERIFIED enum values.
  invoiceCreatePaymentRecord: `mutation($input: InvoiceCreatePaymentRecordInput!) { invoiceCreatePaymentRecord(input: $input) { paymentRecord { id } userErrors { message path } } }`,
  quoteCreatePaymentRecord: `mutation($input: QuoteCreatePaymentRecordInput!) { quoteCreatePaymentRecord(input: $input) { paymentRecord { id } userErrors { message path } } }`,
} as const;

/** Read-only lookups used before writing (idempotency and safety). */
export const QUERIES = {
  account: `query { account { id name tester } }`,
  users: `query($status: UsersStatusFilterEnum!, $after: String) { users(filter: { status: $status }, first: 50, after: $after) { nodes { id name { full } status } pageInfo { hasNextPage endCursor } } }`,
  // note is read only to find our marker; it is never stored.
  entries: `query($after: String, $from: ISO8601DateTime!, $to: ISO8601DateTime!) { timeSheetEntries(filter: { startAt: { after: $from, before: $to } }, first: 50, after: $after) { nodes { id note } pageInfo { hasNextPage endCursor } } }`,
  jobs: `query($after: String) { jobs(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
  expenses: `query($after: String) { expenses(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
  clients: `query($after: String) { clients(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id companyName } pageInfo { hasNextPage endCursor } } }`,
  quotes: `query($after: String) { quotes(searchTerm: "payrollpilot:", first: 50, after: $after) { nodes { id title } pageInfo { hasNextPage endCursor } } }`,
} as const;

// ---------------------------------------------------------------- plan

const PAYMENT_TYPE: Record<string, string> = { credit_card: "CREDIT_CARD", check: "CHECK", ach: "BANK_TRANSFER", cash: "CASH" };

export type PlanResult = {
  steps: Step[];
  skipped: { object: string; ourId: string; reason: string }[];
  manual: { before: string[]; after: string[] };
};

/** Builds the ordered step list. Steps whose ourId is already in `map` are left out (idempotent rerun). */
export function buildPlan(fx: Fixtures, map: IdMap, opts: { currentCycleId: string; companyName: string }): PlanResult {
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
  const clients = [...new Set(fx.jobs.map((j) => j.clientRef as string))].sort();
  for (const c of clients) {
    push({ object: "clients", ourId: c, mutation: "clientCreate", idPath: "clientCreate.client.id", variables: { input: { companyName: `${opts.companyName} client ${c} [${marker(c)}]` } } });
  }
  for (const c of clients) {
    const first = fx.jobs.find((j) => j.clientRef === c)!;
    push({ object: "properties", ourId: c, mutation: "propertyCreate", idPath: "propertyCreate.properties.0.id", variables: { clientId: ref("clients", c), input: { properties: [{ address: { street1: streetOf(first) } }] } } });
  }

  // quotes before jobs, so jobCreate can link quoteId
  for (const q of fx.quotes) {
    const job = q.jobId ? jobs.get(q.jobId as string) : null;
    const clientRef = (job?.clientRef as string) ?? clients[0];
    push({
      object: "quotes", ourId: q.id as string, mutation: "quoteCreate", idPath: "quoteCreate.quote.id",
      variables: { attributes: {
        clientId: ref("clients", clientRef), propertyId: ref("properties", clientRef), title: `${job ? job.title : "Quote"} [${marker(q.id as string)}]`,
        salespersonId: q.salespersonWorkerId ? ref("users", q.salespersonWorkerId as string) : null,
        lineItems: [{ name: job ? String(job.title) : "Landscape work", quantity: 1, unitPrice: dollars(q.amountCents as number) }],
      } },
      note: q.status === "converted" ? undefined : `status ${q.status}: left as created (no transition)`,
    });
  }

  for (const j of fx.jobs) {
    push({
      object: "jobs", ourId: j.id as string, mutation: "jobCreate", idPath: "jobCreate.job.id",
      variables: { input: {
        propertyId: ref("properties", j.clientRef as string), title: `${j.title} [${marker(j.id as string)}]`,
        salespersonId: j.salespersonWorkerId ? ref("users", j.salespersonWorkerId as string) : null,
        quoteId: j.quoteId ? ref("quotes", j.quoteId as string) : null,
        invoicing: { invoicingType: "FIXED_PRICE", invoicingSchedule: "ON_COMPLETION" },
        lineItems: j.totalCents == null ? [] : [{ name: String(j.title), quantity: 1, unitPrice: dollars(j.totalCents as number) }],
      } },
      note: j.parentJobId ? `sub-job of ${j.parentJobId} (Jobber has no parent link; the street in the title is the hint)` : undefined,
    });
  }

  for (const v of fx.visits) {
    push({
      object: "visits", ourId: v.id as string, mutation: "visitCreate", idPath: "visitCreate.visits.0.id",
      variables: { jobId: ref("jobs", v.jobId as string), input: { visits: [{ title: marker(v.id as string), startAt: v.startAt, endAt: v.endAt, assignedUserIds: (v.assignedWorkerIds as string[]).map((w) => ref("users", w)) }] } },
    });
  }
  for (const v of fx.visits) {
    if (!v.isComplete) continue;
    push({ object: "visitCompletes", ourId: v.id as string, mutation: "visitComplete", idPath: "visitComplete.visit.id", variables: { visitId: ref("visits", v.id as string) } });
  }

  // labourRate is not sent per entry: Jobber costs entries at the user's labour rate (set in Manage Team),
  // and the fixtures only hold each worker's current rate, so sending it would rewrite past job costing.
  const workers = new Map(fx.workers.map((w) => [w.id as string, w]));
  for (const e of fx.timeEntries) {
    const id = e.id as string;
    if (e.ticking) {
      skipped.push({ object: "entries", ourId: id, reason: "open timer: started by hand before the pull (manual checklist)" });
      continue;
    }
    if (!workers.has(e.workerId as string)) throw new Error(`entry ${id}: unknown worker ${e.workerId}`);
    const target = e.visitId ? { visitId: ref("visits", e.visitId as string) } : e.jobId ? { jobId: ref("jobs", e.jobId as string) } : {};
    push({
      object: "entries", ourId: id, mutation: "timeSheetEntryCreate", idPath: "timeSheetEntryCreate.timeSheetEntry.id",
      variables: { input: { startAt: e.startAt, duration: e.durationSec, userId: ref("users", e.workerId as string), ...target, note: marker(id) } },
    });
  }

  for (const x of fx.expenses) {
    if (x.source !== "jobber") continue; // QuickBooks purchases are A-06
    push({
      object: "expenses", ourId: x.id as string, mutation: "expenseCreate", idPath: "expenseCreate.expense.id",
      variables: { input: { title: `${x.description} [${marker(x.id as string)}]`, date: `${x.date}T19:00:00Z`, total: dollars(x.amountCents as number), linkedJobId: x.matchedJobId ? ref("jobs", x.matchedJobId as string) : null } },
    });
  }

  for (const i of fx.invoices) {
    push({
      object: "invoices", ourId: i.id as string, mutation: "invoiceCreateFromJob", idPath: "invoiceCreateFromJob.invoice.id",
      variables: { input: { jobId: ref("jobs", i.jobId as string), subject: marker(i.id as string), issuedDate: i.issuedDate, dueDate: i.dueDate } },
      note: i.status === "draft" ? "left as draft" : undefined,
    });
  }
  for (const i of fx.invoices) {
    if (i.status === "draft") continue;
    push({ object: "invoiceSends", ourId: i.id as string, mutation: "invoiceMarkAsSent", idPath: "invoiceMarkAsSent.invoice.id", variables: { invoiceId: ref("invoices", i.id as string) } });
  }

  for (const p of fx.payments) {
    const id = p.id as string;
    if (p.paymentType === "tip") {
      skipped.push({ object: "payments", ourId: id, reason: "tip: Jobber records tips on the invoice, not as a payment record; history only" });
      continue;
    }
    const base = { amount: dollars(p.amountCents as number), entryDate: `${p.entryDate}T19:00:00Z`, adjustmentType: "PAYMENT", paymentOrigin: "MANUAL", paymentDetails: { paymentType: PAYMENT_TYPE[p.paymentType as string] ?? "OTHER", details: marker(id) } };
    if (p.invoiceId) {
      // includes the CHK-19 plant: a quote deposit recorded on the invoice (reads back as "final")
      push({ object: "payments", ourId: id, mutation: "invoiceCreatePaymentRecord", idPath: "invoiceCreatePaymentRecord.paymentRecord.id", variables: { input: { invoiceId: ref("invoices", p.invoiceId as string), ...base } } });
    } else if (p.quoteId) {
      push({ object: "payments", ourId: id, mutation: "quoteCreatePaymentRecord", idPath: "quoteCreatePaymentRecord.paymentRecord.id", variables: { input: { quoteId: ref("quotes", p.quoteId as string), ...base } } });
    }
  }

  return { steps, skipped, manual: manualChecklists(fx, opts.currentCycleId) };
}

// ---------------------------------------------------------------- manual steps (no API for these)

export function manualChecklists(fx: Fixtures, currentCycleId: string): PlanResult["manual"] {
  const rate = (w: Rec) => {
    const c = (w.jobber as Rec | null)?.labourRateCents as number | null | undefined;
    return c == null ? "no labour rate" : `labour rate $${(c / 100).toFixed(2)}/h`;
  };
  const byId = new Map(fx.workers.map((w) => [w.id as string, w]));
  const name = (id: string) => `${byId.get(id)?.displayName} (${id})`;
  const before = [
    "In the Jobber seed account: Settings (gear) > Manage Team > Add team member, one per worker below, with exactly this name (the pusher maps users by name). The account owner user can be renamed to the owner. If the account refuses before all are added, stop and use the reduced config (plan A-01 fallback).",
    ...fx.workers.map((w) => `  [ ] ${w.displayName} (${w.id}) - ${w.role}, ${rate(w)}${w.status === "inactive" ? " - keep ACTIVE until its entries exist" : ""}`),
  ];
  const cur = fx.timeEntries.filter((e) => e.cycleId === currentCycleId);
  const unapproved = cur.filter((e) => !e.approved && !e.ticking);
  const ticking = cur.filter((e) => e.ticking);
  const inactive = fx.workers.filter((w) => w.status === "inactive");
  const after = [
    "Timesheets > Approve Timesheets: approve every entry EXCEPT these (they stay unapproved for CHK-06):",
    ...unapproved.map((e) => `  [ ] leave unapproved: ${e.id} - ${name(e.workerId as string)}, ${e.startAt}`),
    ...ticking.map((e) => `Open timer (CHK-02): just before the pull, log in as ${name(e.workerId as string)} (or start it as admin) and start a timer on the job created for ${e.jobId}; leave it running. It cannot be back-dated, so its elapsed time will differ from the fixture.`),
    ...inactive.map((w) => `After all entries exist: Manage Team > ${name(w.id as string)} > Deactivate (CHK-08).`),
    "Then run the Jobber pull (A-03) with --compare data/fixtures/<company> and check: same entry count for the current cycle (minus the timer until it is started), approved=false on exactly the entries above, ticking=true on exactly one.",
  ];
  return { before, after };
}

/** Replaces every { $ref } in variables with the mapped Jobber id; returns missing refs instead of guessing. */
export function resolveRefs(v: unknown, map: IdMap, missing: string[] = []): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, map, missing));
  if (v && typeof v === "object") {
    if ("$ref" in v) {
      const [kind, ...rest] = String((v as Ref).$ref).split(":");
      const id = map[kind as ObjectKind]?.[rest.join(":")];
      if (!id) missing.push((v as Ref).$ref);
      return id ?? null;
    }
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, resolveRefs(x, map, missing)]));
  }
  return v;
}
