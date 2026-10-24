# Jobber Developer Platform Research (2026-10-24)

Sources: developer.getjobber.com (read via browser pane; the site returns HTTP 403 to non-browser fetchers), help.getjobber.com, support.gusto.com, and a live unauthenticated introspection of `https://api.getjobber.com/api/graphql` (version `2026-09-25`).

Label key:
- **VERIFIED (doc)** = read in the official docs / help center.
- **VERIFIED (introspection)** = read from the live schema returned by the public API endpoint. Caveat: the schema served unauthenticated appears to be Jobber's full internal schema (4,163 types, 464 query roots, 721 mutations; some descriptions say "Internal schema only"). The docs say "Fields and types are secured by permissions and scopes", so what a third-party app can actually use is a subset gated by the app's scopes. Field names and types are exact; availability to your app is not guaranteed until tested in GraphiQL.
- **UNVERIFIED** = inferred or not found in official material.

Full raw schema dump: (local scratch file, not in the repo) (5.6 MB), extractor script `extract.py` alongside it.

---

## 1. Developer testing accounts

Source: https://developer.getjobber.com/docs/getting_started ; https://developer.getjobber.com/docs/building_your_app/testing_your_app

- **How to create — VERIFIED (doc).** "Use the developer testing signup link to create a developer testing account. This differs from a standard Jobber trial in that it provides a 90-day testing window without a subscription prompt." The signup link is on the Getting Started page (Step 1). Two separate accounts are involved: a Developer Center account (developer.getjobber.com; create apps, GraphiQL) and a Jobber business account (the data the app connects to).
- **Duration — VERIFIED (doc).** "Developer testing accounts expire after 90 days. To request an extension, email api-support@getjobber.com."
- **Feature/API coverage — VERIFIED (doc).** "Developer test accounts are limited in features but have access to all exposed items via our API." Mutations are not called out separately, but GraphiQL docs describe testing "Queries/Mutations" against the tester account, and the API docs treat mutations as a normal operation type. The `Account.tester: Boolean!` field exists in the schema (VERIFIED introspection), so you can detect a tester account programmatically.
- **How many you can have — UNVERIFIED.** No limit is stated anywhere in the docs. (Note the Draft-app rule below counts *paying* accounts only; tester accounts are explicitly "non-tester".)
- **Does the app need to be approved/published before connecting — VERIFIED (doc): No.** "Draft - Your app is functional and can connect to up to 5 Jobber accounts. Use this stage to build, test, refine, and use internally. Submitting for review is not required to use the app with your own Jobber account long-term." And: "API access will be blocked if your app is detected connecting to more than 5 paying Jobber accounts while still in Draft state." (https://developer.getjobber.com/docs/publishing_your_app/app_review_process/ ; https://developer.getjobber.com/docs/custom_integrations/)
- **Linking a tester account — VERIFIED (doc).** "Allowing your app to access your test account's data is as simple as following the OAuth flow outlined in Authorizing an App." Or use Developer Center > Manage Apps > "Test in GraphiQL", which runs the same OAuth flow and loads a 60-minute token. Warning: "Each Test in GraphiQL session initiates a new OAuth flow and invalidates existing refresh tokens for that app and admin."
- **Required to create an app — VERIFIED (doc).** App name, Developer name, App description, Scopes. Callback URL / Manage App URL / logo / gallery are only required before publishing.

## 2. OAuth 2.0

Source: https://developer.getjobber.com/docs/building_your_app/app_authorization/ ; https://developer.getjobber.com/docs/building_your_app/refresh_token_rotation/

- **Grant — VERIFIED (doc).** Authorization code grant; PKCE (S256 only) recommended. "Jobber only supports the S256 challenge method."
- **Authorization URL — VERIFIED (doc).**
  `https://api.getjobber.com/api/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<CALLBACK_URL>&state=<STATE>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256`
- **Token URL — VERIFIED (doc).** `POST https://api.getjobber.com/api/oauth/token` with `Content-Type: application/x-www-form-urlencoded` and body `client_id=...&client_secret=...&grant_type=authorization_code&code=...&redirect_uri=...&code_verifier=...`. "This request must be made from your server, not from client-side code." Refresh: `grant_type=refresh_token&refresh_token=...` (plus client_id/client_secret).
- **Token response — VERIFIED (doc).** `{"access_token": "<JWT>", "refresh_token": "...", "token_type": "Bearer", "expires_in": 3600}`.
- **Access token lifetime — VERIFIED (doc).** "Access tokens expire after 60 minutes." It is a JWT whose payload contains `exp`. "You do not need to wait for the access token to expire before refreshing."
- **Authorization code lifetime — VERIFIED (doc).** "Authorization codes expire after 10 minutes and can only be used once."
- **Refresh token — VERIFIED (doc).** "Refresh tokens are long-lived" (no exact lifetime stated — UNVERIFIED). Rotation is a per-app Developer Center setting, "enabled by default and must remain enabled for apps published in the Jobber App Marketplace. It can be disabled during development." With rotation ON, for apps created after Jan 2, 2024 "the previous token is immediately invalidated" (error: "The provided refresh token is not valid."). With rotation OFF the same refresh token is returned plus a `warning` field. Refresh tokens are invalidated when: admin disconnects via Marketplace, `appDisconnect` mutation called, account churn/downgrade/admin deactivation, client secret regenerated, or "The app connection is re-authorized after a scope change."
- **Required headers — VERIFIED (doc).** `Authorization: Bearer <ACCESS_TOKEN>`, `X-JOBBER-GRAPHQL-VERSION: <active version>`, `Content-Type: application/json`. "Specifying a version in the header is required for all apps." Docs examples use `2025-04-16`. **Current latest version string: `2026-09-25`** (top entry of https://developer.getjobber.com/docs/changelog/ — VERIFIED doc). Other active versions listed: 2026-05-12, 2026-04-22, 2026-04-16, 2026-04-13, 2026-03-10, 2026-02-17, 2025-04-16, 2025-01-20, 2024-12-05, 2024-11-12, ... Versions are "supported for a minimum of 12 months, and ... accessible for up to 18 months". Response `extensions.versioning.version` echoes the version applied; a `warning` is added when nearing end-of-support. Observed: an unauthenticated POST with no version header still returned 200 (the API upgrades/defaults silently), but the docs say the header is required.
- **401 behaviour — VERIFIED (doc).** "If the access token is invalid or expired, the API returns a 401 'Invalid Token Error'."
- **Localhost redirect URIs — VERIFIED (official Jobber template repo, linked from https://developer.getjobber.com/docs/app_template_project/).** Jobber's own React template ships `.env.sample` with `REACT_APP_REDIRECT_URL="http://localhost:3000/auth"` and `REACT_APP_JOBBER_API_URL="https://api.getjobber.com/api/oauth/authorize"` (https://github.com/GetJobber/Jobber-AppTemplate-React), and the Rails template uses `CLIENT_APP_ORIGIN=http://localhost:3000` (https://github.com/GetJobber/Jobber-AppTemplate-RailsAPI). So a plain-HTTP localhost callback is the documented development setup. The docs pages themselves only say "OAuth Callback URL: Where Jobber redirects users after they authorize your app" and that it is required only before publishing. GraphiQL testing needs no callback at all.
- **One app, many Jobber accounts — VERIFIED (doc).** "This is what allows your app to securely serve many Jobber customers"; "a company admin for each Jobber account authorizes your app". Rate limits are per app/account pair. Draft apps are capped at 5 *paying* accounts.
- **Who can authorize — VERIFIED (doc).** Only a Jobber **admin** user can authorize an app.
- **After token receipt — VERIFIED (doc).** Recommended to immediately `query { account { id name } }` and store it (works regardless of scopes).
- **Disconnect handling — VERIFIED (doc).** Subscribe to `APP_DISCONNECT` webhook and delete tokens; `appDisconnect` mutation to disconnect from your side. Required only for Marketplace-published apps.

## 3. Time tracking schema (TimeSheetEntry)

Source: unauthenticated introspection of api.getjobber.com (version 2026-09-25) — **VERIFIED (introspection)** unless marked. The docs index confirms "Time Sheet Entry" is an exposed "Important Object" (VERIFIED doc).

### Query roots
- `timeSheetEntries(sort: [TimeSheetEntriesSortAttributes!], filter: TimeSheetEntriesFilterAttributes, after, before, first, last, offset): TimeSheetEntryConnection!` — "All timesheet entries for users on a given day".
- `timeSheetEntry(id: EncodedId!): TimeSheetEntry`.
- `timeSheetUsers(startDate: ISO8601Date!, endDate: ISO8601Date!, filter: TimeSheetUsersFilterAttributes, ...): UserConnection!` — "Timesheet roster: active users plus deactivated users with entries in the date range".
- `timeSheetEntriesByGroup(filter: TimeSheetEntryGroupsFilterAttributes!, ...)` — grouped by job/label for one user + date range (`userId!`, `startDate!`, `endDate!`, `jobIds`).
- `timeSheetAuditEvents(filter: {timeSheetEntryId!, eventType, performedAt}, ...)` — "Audit history for timesheet entry edits and deletes" (eventType CREATE/UPDATE/DELETE, `targetChanges: JSON`).
- Nested: `User.timeSheetsByDay(startDate: ISO8601Date!, endDate: ISO8601Date!, jobIds, ...): TimeSheetUserDayConnection!` (per-day `totalDuration`, `totalUnpaidDuration`, `hoursStatus: NORMAL|ABNORMALLY_HIGH`, `entries`); `Job.timeSheetEntries(...)`; `Visit.timeSheetEntries(...)`.
- Payroll (likely internal/plan-gated — UNVERIFIED availability): `payroll { period(id) periodUser(id) periodUserDay(id) }`, `payrollPeriods`, `PayrollPeriod { startAt endAt status approvedAt approvedBy outOfDate users { regularHours overtimeHours doubleOvertimeHours unpaidHours } }`; mutations `payrollPeriodGenerate/Approve/Edit/Delete`.

### Filter: `TimeSheetEntriesFilterAttributes` (exact input field names)
```
activeOnDate: ISO8601DateTime   # entries active on that day (incl. running from previous day)
assignedTo: EncodedId           # "ID of the user to whom the time sheet entry belongs to"
isApproved: Boolean
isPayable: Boolean
ticking: Boolean
createdAt: Iso8601DateTimeRangeInput
updatedAt: Iso8601DateTimeRangeInput
currentUserOnly: Boolean
startAt: Iso8601DateTimeRangeInput   # date range on start time
```
`Iso8601DateTimeRangeInput { before: ISO8601DateTime, after: ISO8601DateTime, eq: ISO8601DateTime }` ("use either eq or min and max... can be null to expand the range infinitely").
Sort: `TimeSheetEntriesSortAttributes { field: TimeSheetEntriesSortableFieldsEnum! (only START_AT), direction: SortDirectionEnum! }`.
=> **Query by date range AND by user: yes** — `filter: { startAt: { after, before }, assignedTo: <userId> }`. (The deprecated `startsAfter/startsBefore` filters were removed in 2023 — VERIFIED doc changelog.)

### Connection: `TimeSheetEntryConnection`
`edges`, `nodes: [TimeSheetEntry!]!`, `pageInfo: PageInfo!`, **`totalCount: Int!`** — "The total count of possible records in this list. Supports filters. Please use with caution. Using totalCount raises the likelyhood you will be throttled". => Completeness check available.

### Type: `TimeSheetEntry` (exact field names)
```
id: EncodedId!
user: User                      # "User the time sheet entry belongs to."
job: Job                        # "Job linked to the timer."
client: Client                  # via the job
visit: Visit                    # DEPRECATED -> use targetItem
targetItem: TimerTarget         # UNION Assessment | Job | Visit
targetDurationTotal: Int!       # seconds worked against this entry's target
startAt: ISO8601DateTime!
endAt: ISO8601DateTime          # null for entries without a time range
duration: Seconds!              # DEPRECATED -> use finalDuration
finalDuration: Seconds!         # "Duration of a stopped time sheet entry (resolves to 0 for ticking entries)"
ticking: Boolean!               # timer running
approved: Boolean!              # "Indicates whether the time sheet entry is approved."
approvedBy: User
payable: Boolean!               # payable to employee for payroll (NOT customer billability)
paidBy: User                    # "User who marked this time sheet entry as paid."  (<- paid status proxy)
label: String                   # display label (customisable)
timeSheetCategory: TimeSheetEntryConfigurationCategory   # BREAK | DRIVING | OFFICE | SUPPLIES | GENERAL | CUSTOM
originatingTimeSheetConfiguration: TimeSheetEntryConfiguration
note: String
labourRate: Float
startEntryWaypoint / stopEntryWaypoint: Waypoint   # GPS {lat lng accuracy fetchedAt}
createdAt / updatedAt: ISO8601DateTime!
```
- **Approval status field: yes** — `approved: Boolean!` + `approvedBy: User`; filter `isApproved`.
- **Paid status: no boolean**, but `paidBy: User` is set when payroll is confirmed ("Mark Paid" in the UI, see help center). Expense has `paymentStatus: PENDING_REIMBURSEMENT | PAID` filter.
- `Seconds` scalar = Int.

### Mutations (create for seeding) — VERIFIED (introspection)
- **`timeSheetEntryCreate(input: TimeSheetEntryCreateInput!): TimeSheetEntryCreatePayload!`** — "Create a Timesheet entry".
  `TimeSheetEntryCreateInput { startAt: ISO8601DateTime!, duration: Seconds, note: String, userId: EncodedId, jobId: EncodedId, visitId: EncodedId, assessmentId: EncodedId, label: String, labourRate: Float, timeSheetEntryConfigurationId: EncodedId }` — jobId / visitId / assessmentId / label / timeSheetEntryConfigurationId are mutually exclusive. Payload: `timeSheetEntry`, `userErrors: [MutationErrors!]!`.
- `timeSheetEntryEdit(timeSheetEntryId: EncodedId!, input: TimeSheetEntryEditInput!)` (same fields, all optional). `timeSheetEntryDelete(timeSheetEntryId!)`.
- Timers: `timeSheetClockIn(userId, startAt)`, `timeSheetClockOut(userId, stopAt)`, `visitStartTimer(visitId!, userId, startAt)`, `visitStopTimer(visitId!, userId, stopAt, clockedIn)`, `timeSheetEntriesStartTimers/StopTimers(input{userIds!, jobId|visitId|assessmentId|timeSheetEntryConfigurationId, startAt, note})`, `timeSheetEntryStartTimer/StopTimer`, `timeSheetEntryStartFromConfiguration`.
- **No `approve` field on create/edit input and no `timeSheetEntryApprove` mutation exists.** Approval appears only via the UI ("Approve Timesheets" tab) or the (probably internal) `payrollPeriodApprove`. => **UNVERIFIED whether an app can set `approved=true`**; plan to approve seeded entries manually in the test account UI.
- Settings: `updateTimeSheetSettings`, `updateTimeSheetPayrollPeriod` (`TimeSheetSettings { payrollPeriodStartDay: Int! (0=Sun), payPeriodSchedule, overtimeSettings, crewClockInEnabled, entryConfigurations }`).

### Business semantics from help center — VERIFIED (doc)
https://help.getjobber.com/en/articles/timesheets/ , /approving-timesheets/ , /confirm-payroll/
- Workflow: "Timesheets: Track and review... Approve timesheets: Validate... Confirm payroll: Record that employees have been paid."
- "Once approved, timesheets are locked for most users... Admins or users with the appropriate permissions can still update approved entries."
- Approval is bulk by cutoff date + selected team members. Approving requires admin or custom permission "View, record, and edit everyone's" timesheets.
- "Confirm payroll" = "Mark Paid" per employee with a cutoff date; "cannot be undone"; "If you have not already approved the time sheets for this employee, they will be approved automatically when you click Mark Paid." Payroll confirm is admin-only.
- Timer types: visit timer, assessment timer, general timer (travel/breaks/shop), location timers (GPS auto). Plus plan: Driving/Office/Supplies/Break + up to 6 custom labels.
- Deactivated users still appear in timesheets for periods where they tracked time.

## 4. Other relevant types, create mutations, scopes

All field/mutation names **VERIFIED (introspection)**; scope-gating per type **UNVERIFIED** except where quoted.

| Object | Query roots | Key fields for this project | Create mutation(s) | Filter highlights |
|---|---|---|---|---|
| **User** | `users(filter: UsersFilterAttributes, searchTerm, sort, ...)`, `user(id)` (no id => current user) | `id, name { full first last }, email { raw? } (UserEmail), phone, status: UserStatusEnum (ACTIVATED/DEACTIVATED/NOT_INVITED/...), isAccountAdmin, isAccountOwner, labourRate: Float, permissions, timezone, createdAt, lastLoginAt, timeSheetsByDay(...)` | **None** — only `userEdit`; no `userCreate`/invite mutation exposed. Seed employees via UI (Gear > Manage Team). | `UsersFilterAttributes { status: UsersStatusFilterEnum! (ACTIVATED|DEACTIVATED), permissions: {area, level}, userIds }` — note `status` is required |
| **Client** | `clients`, `client(id)` | `id, firstName, lastName, name, companyName, email, phone, balance, isArchived, leadSource, jobs, quotes, invoices` | `clientCreate(input)`, `clientsCreate` (bulk), `propertyCreate` (needed for jobs/quotes) | — (docs example: `clients(first: 25) {... totalCount}`) |
| **Job** | `jobs(filter, sort, searchTerm, ...)` ("100 recently updated jobs"), `job(id)` | `id, jobNumber: Int!, title, jobStatus: JobStatusTypeEnum, jobType, client!, property!, salesperson: User, quote, startAt, endAt, completedAt, total, invoicedTotal, timeSheetEntries, expenses, visits (via visitSchedule), lineItems, jobCosting` | `jobCreate(input: JobCreateAttributes)` — requires `propertyId!`, `invoicing!`; optional `salespersonId`, `title`, `scheduling`, `lineItems`, `quoteId`; `jobCreateFromQuote` | `JobFilterAttributes { status, jobType, createdAt, startAt, endAt, completedAt, visitsScheduledBetween, visitsAssignedToUserId, ids, ... }` |
| **Visit** | `visits(filter, ...)`, `visit(id)` | `id, title, startAt, endAt, duration, isComplete, completedAt, completedBy: String, createdBy: User, assignedUsers: UserConnection, job!, client!, visitStatus, timeSheetEntries, waypoint` | `visitCreate(input: { visits: [VisitCreateAttributes!]! })` "Add visits to a job"; `visitComplete`, `visitEditAssignedUsers` | `VisitFilterAttributes { status, startAt, endAt, completedAt, assignedTo: EncodedId, jobIds, ids, isComplete, ... }` |
| **Quote** (commissions) | `quotes(filter, ...)`, `quote(id)` | `id, quoteNumber: String!, title, client, property, salesperson: User` (the "who sold it" field), `sentAt, transitionedAt, lastTransitioned, quoteTransitionHistory, amounts (total), depositRecords, jobs, createdAt` ; status enum `QuoteStatusTypeEnum: draft, awaiting_response, archived, approved, converted, changes_requested` | `quoteCreate(input: QuoteCreateAttributes)` — requires `clientId!`, `propertyId!`, `lineItems!`; optional `salespersonId`, `transitionQuoteTo`; `quoteApprove`, `quotesMarkAwaitingResponse` | `QuoteFilterAttributes { salespersonId, status, sentAt, createdAt, updatedAt, clientId, cost, quoteNumber }` |
| **Invoice** | `invoices(filter, ...)`, `invoice(id)` | `id, invoiceNumber: String!, subject, invoiceStatus: InvoiceStatusTypeEnum (incl. voided as of 2026-05-12), issuedDate, dueDate, receivedDate, amounts, salesperson: User, client, jobs, paymentRecords(filter), createdAt` | `invoiceCreate(input: InvoiceCreateInput)` — requires `clientId!`, `origin!`, `dueDetails!`, `tax!`, `lineItems!`; `invoiceCreateFromJob`, `invoiceCreateFromVisits`, `invoiceMarkAsSent` | `InvoiceFilterAttributes { status, issuedDate, dueDate, createdAt, updatedAt, clientId, total, invoiceNumber }` |
| **Payment / deposit** | `paymentRecords(...)`: PaymentRecordInterfaceConnection; also `Invoice.paymentRecords`, `Quote.depositRecords`, `Job.paymentRecords` | `PaymentRecordInterface { id, amount: Float!, rawAmount, entryDate, paymentType (cash/check/Jobber Payments...), paymentOrigin, adjustmentType, invoice, quote, client, refunds, allocations }` | `invoiceCreatePaymentRecord(input {invoiceId, amount, adjustmentType!, entryDate!, paymentOrigin!, paymentDetails!})`, `quoteCreatePaymentRecord`, `clientCreatePaymentRecord` | — |
| **Expense** | `expenses(filter, searchTerm, sort, ...)`, `expense(id)` | `id, title!, description, date!, total: Float, enteredBy: User, reimbursableTo: User, paidBy: User, linkedJob: Job, accountingCode, receipt, createdAt` | `expenseCreate(input: ExpenseCreateInput { title!, date!, total, description, reimbursableToId, linkedJobId, accountingCodeId, receiptUrl })` | `ExpenseFilterAttributes { date, createdAt, updatedAt, enteredById, reimbursableToId, paymentStatus: PENDING_REIMBURSEMENT|PAID }` |
| **Account** | `account` (available to all apps regardless of scopes — VERIFIED doc) | `id, name, accountOwner, activeUserCount, tester: Boolean!, inTrial, countryCode, settings` | — | — |

All connections above expose `totalCount: Int!` (VERIFIED introspection).

**Scopes — partially VERIFIED.** The docs say scopes are "configured when creating your app in the Developer Center and are displayed to users on the OAuth authorization page" and that "Fields and types are secured by permissions and scopes" (error: "The field jobs on an object of type Query was hidden due to permissions"). Exact scope strings seen in official text: `read_jobs` ("Reading this field requires the read_jobs scope" — InvoiceReminder.job), `read_quotes` (QuoteReminder.quote), and "the client read scope" for CLIENT_* webhooks. The webhooks doc: "To receive webhook data for a given topic, your app must have the appropriate read scope for that object." The pattern is therefore `read_<object>` / `write_<object>` (UNVERIFIED for the full list; expected: clients, requests, quotes, jobs, scheduled_items/visits, invoices, jobber_payments, users, expenses, time_sheets, custom_fields — confirm in the Developer Center app form). The schema exposes `Application.applicationScopes: String!` ("The scopes requested for this application") but no enum. Jobber's official app-template READMEs (VERIFIED, https://github.com/GetJobber/Jobber-AppTemplate-RailsAPI) describe scopes as per-object checkboxes in the Developer Center UI: "Your app must have (as a minimum) read access to *Clients* and *Users* under the Scopes section" — i.e. you tick read/write per object (Clients, Users, ...) rather than typing scope strings. For this project tick at minimum: read Users, read Time Sheets, read Jobs, read Visits/Scheduled Items, read Quotes, read Invoices, read Expenses, read Clients; add write on Time Sheets/Jobs/Clients/Quotes/Invoices/Expenses only if seeding through the API.

## 5. Rate limits

Source: https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/ — all **VERIFIED (doc)**.

- **Two limiters.** (a) DDoS middleware (Rack::Attack): "2500 requests per 5 minutes (2500 requests/300 s)... on a per app/account basis" -> `429 Too Many Requests`. (b) Query-cost leaky bucket per app/account pair.
- **Bucket.** `maximumAvailable: 10000` points; `restoreRate: 500` points/second. "A query with a cost above this value will never resolve."
- **Cost calculation.** "All fields have a default value of 1 except for the edges, nodes and node connection fields which have a value of 0." Connection cost = `first`/`last` x number of requested fields. "All connection fields are configured to return a maximum of 100 nodes when no arguments are supplied" so an unpaginated connection is costed at 100 x fields. Filters/sorts do not change cost. Nested connections multiply ("can increase exponentially").
- **Response.** `extensions.cost { requestedQueryCost, actualQueryCost, throttleStatus { maximumAvailable, currentlyAvailable, restoreRate } }`. If `requestedQueryCost > currentlyAvailable` you get `errors[0].extensions.code = "THROTTLED"` with HTTP 200 and `actualQueryCost: 0`.
- **Recommended practice.** Always pass `first`/`last`; use Relay cursor pagination (`pageInfo { endCursor hasNextPage }`); add delays/caching; avoid deep nesting; "the job query instead of the jobs query" where possible. No specific page size is mandated — docs examples use `first: 10`, `first: 25`; max is 100 per connection. Suggested for the plan: 50-100 per page for flat timesheet queries (cost = page x fields, e.g. 100 x 12 = 1,200 points, refilled in ~2.4 s). `totalCount` "raises the likelyhood you will be throttled" (schema description).
- Top-level errors always arrive with **HTTP 200**; check `errors` and mutation `userErrors` (https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/).

## 6. Webhooks

Source: https://developer.getjobber.com/docs/using_jobbers_api/setting_up_webhooks/ (VERIFIED doc) + `WebHookTopicEnum` (VERIFIED introspection).

- **Yes, timesheet and job events exist.** `WebHookTopicEnum` values: `APP_CONNECT, APP_DISCONNECT, CLIENT_CREATE/UPDATE/DESTROY, INVOICE_CREATE/UPDATE/DESTROY, JOB_CREATE/UPDATE/DESTROY, JOB_CLOSED, PROPERTY_*, QUOTE_CREATE/UPDATE/DESTROY, QUOTE_SENT, QUOTE_APPROVED, REQUEST_*, VISIT_CREATE/UPDATE/DESTROY, VISIT_COMPLETE, PRODUCT_OR_SERVICE_*, PAYMENT_CREATE/UPDATE/DESTROY, PAYOUT_*, TIMESHEET_CREATE, TIMESHEET_UPDATE, TIMESHEET_DESTROY, EXPENSE_CREATE/UPDATE/DESTROY, ON_MY_WAY_TRACKING_LINK_REQUEST, MARKETING_ITEM_UPDATE, USER_CREATE, USER_UPDATE`.
- Configured per app in the Developer Center (topic + URL); needs the object's read scope.
- Payload (JSON): `{"data":{"webHookEvent":{"topic":"CLIENT_CREATE","appId":"...","accountId":"MQ==","itemId":"MQ==","occurredAt":"2026-07-16T16:31:31-06:00"}}}` — IDs only, no object body; re-query by `itemId`. (Apps created before 2023-12-08 get `occuredAt`.)
- Must respond within **1 second**; at-least-once delivery; duplicates for one action are normal (e.g. INVOICE_UPDATE twice); dedupe on `itemId`+`topic`.
- Signature: header `X-Jobber-Hmac-SHA256` = base64(HMAC-SHA256(client_secret, raw body)).
- No automated alerts for failing endpoints; Jobber may disable webhooks for slow/erroring apps.

## 7. App settings, scopes, publishing

Sources: https://developer.getjobber.com/docs/getting_started ; /docs/building_your_app/editing_your_app/ ; /docs/publishing_your_app/app_review_process/ ; /docs/custom_integrations/ — all **VERIFIED (doc)**.

- **Read vs write scopes.** Scopes "Controls what data your app can read or write"; the webhooks page distinguishes "read scope" per object. Choose minimal scopes ("Apps that plan to be published... will be rejected if their apps exceed the scope of their need").
- **Changing scopes.** "While your app is in Draft, scopes can be freely edited. If you add scopes after publishing, existing users will need to re-authorize your app." Editing page: "If you add scopes for the app, you will see a re-authorization banner appear when logged into Jobber Online that will require you to allow the app access to the additional scopes... The same screen will appear when accessing GraphiQL." "If you remove scopes, tokens will still have the old scopes. It is advised you disconnect and then reconnect." Re-authorizing after a scope change invalidates the old refresh token.
- **Publishing needed for own account? No.** "If you are building an integration for your own use and don't plan to list it publicly, App Review is not required. Your app can remain in Draft status indefinitely and function as normal." "Functionality is the same between Draft and Published apps, except for the connection limit" (5 paying accounts). Franchise/multi-account internal apps can request a lighter review to lift the 5-account cap.
- Other Draft rules: no mass-distributing connect URLs; don't recruit existing Jobber customers to test without coordinating with Jobber.
- Refresh Token Rotation toggle can be OFF in development (simplifies hackathon token handling) but must be ON to publish.
- Statuses: Draft -> In Review (no edits) -> Changes Requested / Approved -> Published; ~2-week beta after approval.
- Developer Center team members all have equal app permissions; invitations expire after 30 days; 2FA required.

## 8. Endpoint reachability (curl, no auth)

`POST https://api.getjobber.com/api/graphql` with `{"query":"{ account { id } }"}`:
- **HTTP 200** (not 401) with body
  `{"errors":[{"message":"The field account on an object of type Query was hidden because you are unauthenticated","locations":[...],"path":["account"],"extensions":{"code":"UNAUTHENTICATED"}}],"data":{"account":null}}`.
- Host/path confirmed. Note: unauthenticated requests get GraphQL-level `UNAUTHENTICATED` errors with HTTP 200; the docs' "401 Invalid Token Error" applies when a Bearer token is present but invalid/expired (VERIFIED doc) — our test sent no token (UNVERIFIED for the bad-token case).
- `{ __typename }` without version header -> 200 `{"data":{"__typename":"Query"}}`.
- **Introspection is open without auth** (`__schema`, `__type`), which is how the schema facts above were obtained.
- `developer.getjobber.com` itself returns 403 to curl/WebFetch (bot protection); it loads fine in a real browser.

## 9. Jobber <-> Gusto sync: what is NOT synced

Sources: https://help.getjobber.com/en/articles/jobber-and-gusto-integration/ (updated 2026-03-12) and https://support.gusto.com/article/230913112019060/integrate-with-jobber — **VERIFIED (doc)**.

- Jobber: "The integration only supports the syncing of timesheet hours for hourly employee types in Gusto. Salary, contractor, or commission employee types are not supported. If you have any of these employees in your Jobber account, you will need to select 'Don't sync data to Gusto' from the dropdown for those employees in order to proceed."
- Gusto: "The following data syncs from Jobber to Gusto for hourly employees: Regular hours, Overtime hours, Double overtime hours, Reimbursable expense data (if ... turned on in your Jobber settings). The integration does not support salary, contractor, or commission employee types."
- Only **approved** timesheets sync ("Timesheets will sync to Gusto when they are approved in Jobber"); "approving timesheets is the trigger for timesheets to sync" (Confirm Payroll article). Sync goes only into an **unprocessed** Gusto payroll and **overwrites** manually entered hours ("Jobber should be treated as the source of truth").
- Jobber data lands in Gusto's payroll section, not Gusto Timesheets.
- Two sync modes: "Timesheet hours and reimbursable expenses" or "Timesheet hours only".
- Overtime rules (weekly, daily, daily double, 7th consecutive day + threshold hours) are configured in the Jobber-side Gusto dashboard; "overtime exemptions or extra incentives, add them manually in Gusto".
- Availability: US only, Jobber Connect plan or higher (Gusto page: "Connect or Grow"), admin must set up. Unmatched Jobber users are flagged with an exclamation icon; mapping is manual per team member.
- Not mentioned at all (so UNVERIFIED/not synced): bonuses, commissions as pay items, tips, PTO, salaried hours, contractor payments, labour rates/pay rates.

---

## Quick implications for the hackathon plan
1. Create a Developer Center account + Draft app; create a 90-day developer tester Jobber account; connect via "Test in GraphiQL" first (zero auth code), then implement the OAuth code flow with PKCE; consider turning Refresh Token Rotation OFF during the hackathon.
2. Use header `X-JOBBER-GRAPHQL-VERSION: 2026-09-25` (or the docs' `2025-04-16`), send everything as POST JSON to `https://api.getjobber.com/api/graphql`, and check `errors[].extensions.code` (`THROTTLED`, `UNAUTHENTICATED`) on HTTP 200 responses.
3. Core pull: `users(filter:{status: ACTIVATED}, first: 100)` then `timeSheetEntries(first: 100, filter:{ startAt:{after, before}, assignedTo: <id> }) { totalCount nodes { id startAt endAt finalDuration approved approvedBy{id} payable paidBy{id} label timeSheetCategory ticking note job{id jobNumber} targetItem{__typename ... on Visit{id}} user{id name{full}} } pageInfo{hasNextPage endCursor} }`; compare `totalCount` with nodes fetched.
4. Seeding: `clientCreate` -> `propertyCreate` -> `jobCreate` (+ `visitCreate`) -> `timeSheetEntryCreate(startAt, duration, userId, jobId|visitId|label)`; `expenseCreate(reimbursableToId, linkedJobId)`; `quoteCreate(salespersonId)`; `invoiceCreate` + `invoiceCreatePaymentRecord`. Employees must be added in the Jobber UI (no user-create mutation); approving timesheets must be done in the UI (no approve mutation found).
5. Commission signals: `Quote.salesperson`, `Job.salesperson`, `Invoice.salesperson`, `QuoteFilterAttributes.salespersonId`, `Quote.sentAt`, `quoteTransitionHistory`, `QUOTE_SENT`/`QUOTE_APPROVED` webhooks.
6. Gusto gap to exploit: salaried, contractor and commission team members are explicitly excluded from the Jobber->Gusto sync; only approved hourly time + reimbursable expenses flow.
