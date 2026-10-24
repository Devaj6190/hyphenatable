# QBO sandbox + Gusto Embedded demo — research notes (2026-10-24)

Sources: official docs only (developer.intuit.com, docs.gusto.com, dev.gusto.com, gusto.com developer FAQ, npm registry / GitHub for SDK status). Intuit doc pages are JS-rendered; they were read in the in-app browser. Each finding is tagged VERIFIED (read in the official page, URL given) or UNVERIFIED.

---

## PART A — QuickBooks Online (QBO) API sandbox

### A1. Developer account and sandbox companies — VERIFIED
Source: https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/manage-your-sandboxes and https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/sandbox-faqs

- "When you create your developer profile, you automatically get a sandbox company." "You automatically start with a US-based sandbox when you create your developer account."
- "Sandbox companies are regionally-specific QuickBooks Online companies with sample data."
- Count: "You can create up to 10 sandbox companies." / "You can have a maximum of 10 sandbox companies."
- Expiry: "They're valid and active for two years." "You can't renew expired sandbox companies. You'll need to create a new one."
- Create more: My Hub > Sandboxes > Add > choose "QuickBooks Online Plus or QuickBooks Online Advanced" (Plus: pick a country; Advanced: US only). Region/SKU can't be changed later.
- US sample dataset: "Company type: Construction Trade, 141 transactions, 31 customers, 26 vendors, 4 employees, 20 items, 90 accounts." (Construction trade = job-costing flavoured data, useful for our job-expense use case.)
- Sandbox base URL: `https://sandbox-quickbooks.api.intuit.com/v3`
- Credentials: use the **Development** Client ID/Secret (Keys and credentials > Development > Show Credentials) for sandbox.
- Not supported in sandbox: Payroll ("Payroll isn't a supported feature for sandbox companies."), live bank connections, import/export.
- "Sandboxes automatically connect to our testing tools, like the OAuth 2.0 Playground".

### A2. OAuth 2.0 for sandbox — VERIFIED
Sources: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0 ; .../faq ; .../set-redirect-uri ; .../oauth-2.0-playground

- Scope for accounting: `com.intuit.quickbooks.accounting` (example auth URL: `https://appcenter.intuit.com/connect/oauth2?client_id=...&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=...&state=...`). `state` is required ("the Intuit OAuth 2.0 Server server won't accept requests without these parameters").
- Token endpoint: `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` with Basic auth `base64(client_id:client_secret)`, body `grant_type=authorization_code&code=...&redirect_uri=...` (refresh: `grant_type=refresh_token&refresh_token=...`). Revoke: `POST https://developer.api.intuit.com/v2/oauth2/tokens/revoke`.
- Access token life: "Access tokens are valid for 3,600 seconds (or one hour)." Response field `expires_in: 3600`.
- Refresh token life: "Refresh tokens are valid for 100 days. This expiry date is rolling and gets extended each time it's used to refresh an access token." Hard max 5 years. "We update the value of the refresh_token value every 24 hours" — always persist the latest refresh_token from each response.
- Redirect URI rules: "Each app has two URIs: one for testing environments (i.e., sandboxes), and another for live, in-production apps." **"TIP: You can add localhost (no HTTPS) as a URI for sandbox environments."** Production: "can only redirect to URIs beginning with https. IP addresses aren't allowed." Redirect URIs must match exactly "including casing, http scheme, and trailing '/'"; "Redirect URIs shouldn't have any query parameters."
- Auth response to redirect URI carries `code`, `state`, and `realmId` ("The unique ID of the connected user's QuickBooks Online company" — needed in every API URL).
- OAuth 2.0 Playground (no code needed to get tokens): "From the Select app dropdown, select one your sandbox companies... In the Scopes section, select one or more scopes. Select Get authorization code... Select Get tokens." It also generates curl examples and has a "Refresh Access Token" section. Hackathon shortcut: get access_token + refresh_token + realmId from the Playground and drop them in `.env`; refresh programmatically thereafter.
- Discovery docs: separate sandbox and production discovery documents are linked from the OAuth page (sandbox: https://developer.intuit.com/.well-known/openid_sandbox_configuration — UNVERIFIED exact URL, not read).

### A3. Entities for job expenses — VERIFIED
Sources: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase ; .../customer ; .../class ; .../bill ; https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries

**Purchase** ("A Purchase object represents an expense, such as a purchase made from a vendor."):
- `PaymentType` (required): "Type can be Cash, Check, or CreditCard."
- `AccountRef` (required, header-level): the paying account — "A type of Check should have bank account, CreditCard should specify credit card account".
- `EntityRef` (optional): "Specifies the party with whom an expense is associated. Can be Customer, Vendor, or Employee." (`EntityRef.type` = "Vendor" for a vendor purchase.)
- `TxnDate` (filterable, sortable), `DocNumber` (filterable, sortable, max 21 chars), `TotalAmt` (read-only, computed; "The TotalAmt attribute must add up to sum of Line.Amount attributes").
- `PrivateNote`: "User-entered, organization-private note about the transaction. This field maps to the Memo field on the Expense form in the QuickBooks UI." (max 4000 chars)
- `DepartmentRef` (Location), `PaymentMethodRef`, `Credit` (true = refund, CreditCard only), `LinkedTxn`.
- `Line[]` (required): "Valid Line types include ItemBasedExpenseLine (Available if Preferences.ProductAndServicesPrefs.ForPurchase is set to true) and AccountBasedExpenseLine". For create: "Valid Linetype for create: AccountBasedExpenseLine".
  - Line: `Id`, `DetailType` = `AccountBasedExpenseLineDetail`, `Amount` (required), `Description` ("Free form text description of the line item that appears in the printed record.", max 4000), `LineNum`.
  - `AccountBasedExpenseLineDetail` children:
    - `AccountRef` (required): "Reference to the Expense account associated with this item... where Account.AccountType=Expense"
    - `CustomerRef`: "Reference to the Customer associated with the expense... Use Customer.Id and Customer.DisplayName" — this is the **job/customer** tag.
    - `ClassRef`: "Reference to the Class associated with the expense. Available if Preferences.AccountingInfoPrefs.ClassTrackingPerLine is set to true."
    - `BillableStatus` (read-only via API): "Valid values: Billable, NotBillable, HasBeenBilled" — "This field is not updatable through an API request."
    - `TaxCodeRef`, `TaxAmount`, `TaxInclusiveAmt`, `MarkupInfo`, `CustomExtensions` (Dimensions, IES only).
  - Sample objects also show a line-level `ProjectRef: { value }` (Projects).
- Operations: `POST /v3/company/<realmID>/purchase` (create), `POST /v3/company/<realmID>/purchase?operation=delete` (needs Id + SyncToken), `GET /v3/company/<realmID>/query?query=<selectStatement>`; doc sample query: `select * from Purchase where TotalAmt < '100.00'`.
- Minimal create body (from doc):
  ```json
  {"PaymentType":"CreditCard","AccountRef":{"name":"Visa","value":"42"},
   "Line":[{"DetailType":"AccountBasedExpenseLineDetail","Amount":10.0,
     "AccountBasedExpenseLineDetail":{"AccountRef":{"name":"Meals and Entertainment","value":"13"}}}]}
  ```
  Add `CustomerRef`, `ClassRef`, `Description` inside the line detail, `TxnDate`, `PrivateNote`, `EntityRef` at header to make a fully tagged job expense.

**Bill**: "A Bill object is an AP transaction representing a request-for-payment from a third party for goods/services rendered, received, or both." `VendorRef` required (filterable, sortable); Line types "ItemBasedExpenseLine and AccountBasedExpenseLine" (same `AccountBasedExpenseLineDetail` with CustomerRef/ClassRef/BillableStatus).

**Customer / job mapping**: "An individual customer can have an underlying nested structure, with a parent customer (the top-level object) having zero or more sub-customers and jobs associated with it." Job example: "Tracking a kitchen remodel: the home owner is the parent customer and individual kitchen remodel tasks are jobs."
- `Job` (Boolean): "If true, this is a Job or sub-customer. If false or null, this is a top level customer".
- `ParentRef`: "A reference to a Customer object that is the immediate parent of the Sub-Customer/Job in the hierarchical Customer:Job list. Required for the create operation if this object is a sub-customer or Job."
- `IsProject` (read-only Boolean): "If true, indicates this is a Project." (Projects are Customers with IsProject=true.)
- `FullyQualifiedName` (filterable, sortable): "Takes the form of Customer:Job:Sub-job... Limited to 5 levels." `Level` (0 = top), `BillWithParent`.
- So "job" in QBO = a Customer row with `Job=true` + `ParentRef` (or a Project with `IsProject=true`); an expense is tagged to the job via the line's `CustomerRef`.

**Class**: "Class objects provide a way to track different segments of the business so they're not tied to a particular client or project... Classes are available to the entire transaction or to individual detail lines of a transaction." `Name` required (max 100).

**Query syntax**:
- `SELECT * | count(*) FROM IntuitEntity [WHERE WhereClause] [ORDERBY OrderByClause] [STARTPOSITION Number] [MAXRESULTS Number]`
- Operators: `IN, =, <, >, <=, >=, LIKE` (`%` only wildcard). Multiple filters with `AND` only ("The OR operation isn't supported."). No projections, GROUP BY, JOIN. Entity name case-sensitive in the table note, but "Reserved words, entity names, and attribute names are not case sensitive" in the syntax section (be safe: use `Purchase`). Only `=`/`IN` on `Id`.
- Dates: `SELECT * FROM Invoice WHERE TxnDate > '2011-01-01' AND TxnDate <= CURRENT_DATE`; `MetaData.LastUpdatedTime > '2011-08-10T10:20:30-0700'`; `CustomerRef = '123'` works as a filter on transactions (doc example on Invoice).
- Pagination: "The maximum number of entities that can be returned in a response is 1,000. If the result size isn't specified, the default number is 100." `STARTPOSITION 1 MAXRESULTS 10`, then `STARTPOSITION 11 ...` (1-based).
- Count: "SELECT COUNT(*) FROM Customer" → "The number of entities is returned as the value of the totalCount field of the <QueryResponse> element." Good for completeness checks (compare COUNT vs. rows fetched).
- Response: `QueryResponse` with `startPosition`, `maxResults`, `totalCount` (for count), and entity array (`Purchase: [...]`). Query can also be `POST .../query` with body = statement and `content-type: application/text`.
- Caveat: `select *` on Purchase returns header + lines; filtering by line-level `CustomerRef` on Purchase is not documented as filterable (header `EntityRef`/`TxnDate`/`DocNumber`/`TotalAmt` are) — UNVERIFIED whether `WHERE CustomerRef=` works on Purchase; plan to filter client-side after paging by TxnDate.

### A4. Creating Purchases in sandbox; limits — VERIFIED
- Create is a normal API operation (`POST /v3/company/<realmID>/purchase`, Sandbox Base URL `https://sandbox-quickbooks.api.intuit.com`), so seeding planted errors by API is supported. Sample data can't be "reset" but can be wiped: "Clear data and reset... deletes all the data, but keeps the sandbox company."
- Limits (https://developer.intuit.com/app/developer/qbo/docs/learn/limits-and-throttles): Sandbox servers: "500 requests per minute per realm ID. 10 requests per second, per realm ID and app. 40 emails per day per Realm." Batch: "Recommended maximum number of payloads in a single batch request is 30. Throttled at 40 Batch requests per minute, per realm ID and app." "You'll see HTTP Status Code 429 when throttling occurs. If you see this, wait 60 seconds before retrying." "Any requests that take longer than 120 seconds to execute will time out." Max 1000 entities per query response. Up to 10,000 lines per transaction. No separate "10 concurrent" rule in the current doc — the stated per-second cap is 10 req/s per realm+app (the old "10 concurrent" figure is from a 2016 blog — UNVERIFIED/outdated).
- "Requests are performed in a multi-threaded environment. There may be timing issues leading to unexpected results." (Seed sequentially, then re-query.)
- Batch endpoint exists (`Batch` entity) for up to ~30 operations per call — useful for seeding.

### A5. Node.js SDK / client — VERIFIED
Source: https://developer.intuit.com/app/developer/qbo/docs/develop/sdks-and-samples-collections/nodejs ; npm registry
- Official Intuit library: `intuit-oauth` ("Intuit Node.js client for OAuth2.0 and OpenIDConnect"), repo `github.com/intuit/oauth-jsclient`, maintained by Intuit staff; npm latest **4.2.5**, published **2026-07-15**. Handles authorize URL, token exchange, refresh, revoke, `environment: 'sandbox'|'production'`, and has a generic `makeApiCall`.
- Data SDK: `node-quickbooks` is explicitly **community** ("Node.js SDK (community-contributed SDK)... Intuit is not affiliated with the below community-contributed SDK and assumes no liability"). npm latest 2.0.50, author Michael Cohen (mcohen01); one older version (2.0.22) was deprecated for leaking refresh tokens to console.
- Recommendation: use `intuit-oauth` for tokens + plain `fetch` against `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/query?query=...&minorversion=75` (minorversion param — UNVERIFIED current value; check API Explorer).

### A6. Reset / delete sandbox — VERIFIED
- "Can I reset or delete sandbox data? No. You can't reset the sample data in sandbox companies. However, you can delete all of the data and completely start over." UI: Action column > "Clear data and reset" (keeps company, wipes all data) or "Delete entire sandbox". After clearing you may hit a "duplicate objects" caching error — sign out/in.
- Practical: do NOT clear the US sandbox (you'd lose the Construction Trade sample data); create planted errors on top of sample data and delete them by API (`operation=delete`) if needed; or spin up a second sandbox (10 allowed).

---

## PART B — Gusto Embedded Payroll demo environment

### B1. Demo environment, signup, demo companies
- VERIFIED (https://docs.gusto.com/embedded-payroll/docs/getting-started): "To begin development, go to Gusto's Developer Portal" (https://dev.gusto.com/accounts/sign_up). "Follow the steps to create an account, set up an Organization, and create an Application." "This will create the credentials necessary to access our Demo environment (https://api.gusto-demo.com)." "The application will generate a unique client_id and secret". "newly created Applications will be set to the latest stable API version."
- VERIFIED (https://docs.gusto.com/embedded-payroll/docs/quickstart): "An Organization represents the entity that will be using the Embedded Payroll API"; Organizations manage team members, Applications, demo companies; "create multiple applications for testing in our Demo environment". Application needs at least one redirect URI.
- VERIFIED (https://docs.gusto.com/embedded-payroll/docs/platform-overview): "Register for a developer account to access the demo environment." No approval step is described for demo access.
- VERIFIED (Gusto Developer FAQ, https://gusto.com/about/bd/getting-started): "Once you've created an account at dev.gusto.com and completed your Organization setup, you will have access to your unique API token from the Organizations tab and this is used for provisioning new Gusto accounts. Next, create an application to obtain API credentials - or 'keys' - to access our demo environment... Then create a demo company so that you can explore our product and successfully connect your application to Gusto via OAuth2... **Demo companies are automatically generated with company info, employees, and previous payrolls so you can begin testing right away.**" Also: "We do support multiple redirects in demo for development purposes." The same FAQ page says "To get started, fill out a Production Pre-Approval form, sign up for a Developer Portal account and onboard to our sandbox environment" — the pre-approval form appears to gate production, not demo signup (see B8).
- Two ways to get a company in demo:
  1. Developer Portal "Demo Companies" tab → pre-seeded, fully onboarded company with employees + payroll history. UNVERIFIED exact quote (search-engine snippet of a since-removed Gusto page: "you can skip onboarding by generating a demo company from your Developer Portal Account via the Demo Companies tab. This creates a fully onboarded company with employees and previous payroll data"); the FAQ page above VERIFIES the substance.
  2. API: `POST /v1/partner_managed_companies` (VERIFIED https://docs.gusto.com/embedded-payroll/reference/post-v1-partner-managed-companies): Bearer **system access token**, scope `partner_managed_companies:manage`; body `{ "user": {first_name, last_name, email, phone?}, "company": {name, trade_name?, ein?, contractor_only?} }`; 200 returns `company_uuid`, `access_token`, `refresh_token`, `expires_in` (7200). This company is EMPTY (no employees, not onboarded) — you'd have to onboard it (see B7). "Partner Managed Companies won't appear in your Dev Portal account" — UNVERIFIED (search snippet).
- Hackathon recommendation: use the Developer Portal demo company (pre-onboarded, has pay schedule, employees, past payrolls) and connect via OAuth2 to get a company token.

### B2. Auth, base URL, what works in demo — VERIFIED
Sources: https://docs.gusto.com/embedded-payroll/docs/authentication ; .../docs/oauth2 ; .../docs/scopes ; .../docs/api-fundamentals
- Base URL demo: `https://api.gusto-demo.com` (prod: `https://api.gusto.com`). Path version stays `/v1`.
- Token types:
  - **System access token** (application-level): `POST /oauth/token` with `{"grant_type":"system_access","client_id":...,"client_secret":...}` → `expires_in` 7200. "The token will expire after two hours." Used for `partner_managed_companies`, invoices. (Legacy "partner API tokens are deprecated in favor of system access tokens" from v2024-04-01.)
  - **Company access token**: "To call the API on behalf of a company, you need a company-level access token." Scoped to one company ("cannot be used to access other companies"). "Access tokens expire after two hours." Refresh: `POST /oauth/token` grant_type `refresh_token` (refresh tokens rotate; old one is revoked on use). Obtained either from the `partner_managed_companies` response or via OAuth2 authorization-code flow.
  - OAuth2 authorize: `GET {host}/oauth/authorize?client_id=...&redirect_uri=...&response_type=code` → code valid 10 minutes → `POST {host}/oauth/token` JSON `{client_id, client_secret, redirect_uri, code, grant_type:"authorization_code"}`. "Only primary or full-access admins can authorize new apps." (Docs show `api.gusto.com`; for demo use `api.gusto-demo.com` — VERIFIED that "when developing an integration, all API calls should be made to Gusto's demo environment api.gusto-demo.com", host substitution for /oauth/authorize UNVERIFIED but standard.) "OAuth does not support wildcard URIs or URIs with fragments". Localhost redirect in demo: UNVERIFIED (FAQ says multiple redirects allowed in demo and editable from the Applications tab).
  - Header: `Authorization: Bearer <token>`.
- Scopes: "By default, scopes are not enforced in the demo environment (api.gusto-demo.com)." "Requests outside assigned scopes succeed in demo but return 403 Forbidden in production." Check with `GET /v1/token_info`. → Everything below works in demo without partner approval.
- Versioning: header `X-Gusto-API-Version` (e.g. `2026-06-15`, which is the only/default enum in current reference pages); omitted → app's "Default API version" in the Developer Portal; sunset versions return 406. Response echoes the header. Banner on docs: "v2026-02-01, v2025-11-15, and v2025-06-15 are in the process of deprecation."
- Pagination: `page` & `per` (default 25; headers `X-Page`, `X-Total-Count`, `X-Total-Pages`, `X-Per-Page`) or cursor `starting_after_uuid` + `limit` (`X-Has-Next-Page`).
- Idempotency keys recommended on POST creates.

### B3. Payroll endpoints (regular + off-cycle) — VERIFIED
Sources: https://docs.gusto.com/embedded-payroll/reference/get-v1-companies-company_id-payrolls ; .../get-v1-companies-company_id-payrolls-payroll_id ; .../put-v1-companies-company_id-payrolls-payroll_id-prepare ; .../put-v1-companies-company_id-payrolls ; .../put-v1-companies-company_id-payrolls-payroll_id-calculate ; .../put-v1-companies-company_id-payrolls-payroll_id-submit

- **List**: `GET /v1/companies/{company_id}/payrolls` — params `processing_statuses` (`processed`, `unprocessed`; "defaults to processed"), `payroll_types` (`regular`, `off_cycle`, `external`; "defaults to regular"), `include` (`taxes, payroll_status_meta, totals, risk_blockers, reversals`), `start_date`, `end_date`, `sort_order`. Default returns processed regular payrolls from past 6 months, page max 100. To find the open draft: `?processing_statuses=unprocessed&payroll_types=regular,off_cycle`.
  Response: `payroll_uuid`, `processed` ("Whether or not the payroll has been successfully processed."), `payroll_deadline`, `check_date`, `pay_period {start_date,end_date,pay_schedule_uuid}`, `off_cycle`, `off_cycle_reason`, `totals`, `calculated_at`.
- **Get one**: `GET /v1/companies/{company_id}/payrolls/{payroll_id}?include=benefits,deductions,taxes,payroll_status_meta,totals,risk_blockers,reversals,payroll_taxes`. `calculated_at`: "A timestamp of the last valid payroll calculation. Null if there isn't a valid calculation." `employee_compensations` paginated max 100.
- **Prepare** (must precede update): `PUT /v1/companies/{company_id}/payrolls/{payroll_id}/prepare` — "Prepares an unprocessed payroll for update." Adds eligible employees to Bonus/Correction/Adhoc off-cycles; refreshes `check_date`, `payroll_deadline`, `payroll_status_meta`; "Nullifies calculated_at and totals if the payroll was previously calculated"; returns per-employee `version` ("The current version of this employee compensation. This field is only available for prepared payrolls."). Scope `payrolls:write employees:read`. Response `Payroll-Prepared` includes `employee_compensations[]` each with `employee_uuid`, `version`, `excluded`, `payment_method`, `memo`, `fixed_compensations[] {name, amount, job_uuid, breakdowns}`, `hourly_compensations[] {name, hours, amount, compensation_multiplier, flsa_status, breakdowns}` ("Hourly compensations include regular, overtime, and double overtime hours."), `paid_time_off[] {name, hours, amount, final_payout_unused_hours_input, approved_request_hours}`. "Fixed compensations include tips and bonuses."
- **Update (fill the draft)**: `PUT /v1/companies/{company_id}/payrolls/{payroll_id}` — "This endpoint allows you to update information for one or more employees for a specific unprocessed payroll." Scope `payrolls:write`. Body:
  ```json
  {"employee_compensations":[
    {"employee_uuid":"...","version":"<from prepare>",
     "excluded":false,"payment_method":"Direct Deposit","memo":"...",
     "fixed_compensations":[{"name":"Bonus","amount":"100.00","job_uuid":"..."}],
     "hourly_compensations":[{"name":"Regular Hours","hours":"40.000","job_uuid":"..."}],
     "paid_time_off":[{"name":"Vacation Hours","hours":"8.000"}]}]}
  ```
  Max 100 employee_compensations per request. "If you do not include specific employee compensations, fixed/hourly compensations, or deductions in your request body, they will not be removed from the payroll." "You cannot modify the structure of the payroll object through this endpoint." Stale `version` → 409/422 "You are attempting to update a resource using an out-of-date version." 200 returns `Payroll-Prepared` ("Only the employee compensation objects that were inputted will be returned."). Processed payroll → "This payroll has already been processed. Its data cannot be updated or altered."
  **This is "filling the draft"; it does not submit.** The payroll stays `processed: false`.
- **Calculate (optional preview)**: `PUT /v1/companies/{company_id}/payrolls/{payroll_id}/calculate` — "Performs calculations for taxes, benefits, and deductions for an unprocessed payroll." Async, 202; "The calculated payroll details provide a preview of the actual values that will be used when the payroll is run." Leaves payroll unprocessed. Scope `payrolls:run`. Blocked company → 422 with blocker categories.
- **Submit (DO NOT CALL)**: `PUT /v1/companies/{company_id}/payrolls/{payroll_id}/submit` — "Submits an unprocessed payroll to be calculated and run." Async 202; "You should poll to ensure that payroll is processed successfully." Only submit moves it to processed. Scope `payrolls:run`. Body may carry `submission_blockers[] {blocker_type, selected_option}`.
- Blockers: `GET /v1/companies/{company_uuid}/payrolls/blockers` (from https://docs.gusto.com/embedded-payroll/docs/payroll-blockers); 422 `payroll_blocker` category; keys e.g. `geocode_error`, `missing_signatory`, `needs_approval`, `pending_recovery_case`.
- Fixed compensation type names seen in the update-endpoint example `fixed_compensation_types`: **Bonus, Commission, Paycheck Tips, Cash Tips, Correction Payment, Reimbursement** (VERIFIED). Changelog (v2024-03-01) says fixed_compensation_types moved to a top-level array on the payroll object and "Owner's Draw, Minimum Wage Adjustment, and Severance cannot be added by partners" — UNVERIFIED (search snippet of changelog). The `name` must match exactly ("The name of the compensation. This also serves as the unique, immutable identifier for this compensation.").

### B4. Off-cycle payrolls — VERIFIED
Source: https://docs.gusto.com/embedded-payroll/reference/post-v1-companies-company_id-payrolls
- `POST /v1/companies/{company_id}/payrolls` — "Creates a new, unprocessed, off-cycle payroll." Scope `payrolls:run`. 200 returns an unprocessed payroll.
- Required: `off_cycle` (bool, must be true), `off_cycle_reason`, `start_date`, `end_date`. Request enum for `off_cycle_reason`: **Bonus, Correction, Adhoc, Dismissed employee, Transition from old pay schedule** (response-side enum is wider: also Benefit reversal, Hired employee, Wage correction, Tax reconciliation, Reversal, Disability insurance distribution). Optional: `employee_uuids[]` ("At least one UUID is required for non-termination off-cycle payrolls"; "Cannot add more than 25 new employees to the payroll per call"), `check_date`, `pay_schedule_uuid` (only for Transition), `withholding_pay_period` (Every week / Every other week / Twice per month / Monthly / Quarterly / Semiannually / Annually), `skip_regular_deductions` ("Block regular deductions and contributions for this payroll."; default: blocked when reason=Bonus, included when reason=Correction), `fixed_withholding_rate` (22% federal supplemental rate), `is_check_only_payroll`.
- Tips/commission on an off-cycle: supported as `fixed_compensations` names (Commission, Paycheck Tips, Cash Tips) via the same prepare → update flow (VERIFIED names; whether every type is enabled for a given demo company depends on its `fixed_compensation_types` — check the prepared payroll).

### B5. Employees, jobs, compensations, contractors, time off — VERIFIED
- `GET /v1/companies/{company_id}/employees` (scope `employees:read`): params `include` (`all_compensations, all_home_addresses, company_name, current_home_address, custom_fields, portal_invitations`), `terminated`, `page`, `per`. Fields: `uuid`, `first_name`, `last_name`, `jobs[]`, `onboarded`, `onboarding_status` (`onboarding_completed`, `admin_onboarding_incomplete`, ...), `payment_method` (`Direct Deposit`|`Check`). Job `rate`, `payment_unit`, `current_compensation_uuid`, `compensations` need `compensations:read` (not enforced in demo).
- `GET /v1/jobs/{job_id}/compensations`: `rate` ("The dollar amount paid per payment unit."), `payment_unit` enum **Hour, Week, Month, Year, Paycheck** ("If the employee is an owner, rate should be 'Paycheck'"), `flsa_status` enum **Exempt, Salaried Nonexempt, Nonexempt, Owner, Commission Only Exempt, Commission Only Nonexempt**, `effective_date`, `adjust_for_minimum_wage`, `minimum_wages[]`.
- Hours: hourly employees get hours on the payroll via `hourly_compensations[].hours` on the update endpoint (B3). There is no separate "timesheet" API in Embedded (UNVERIFIED — none found in llms.txt index).
- Contractors: `GET /v1/companies/{company_uuid}/contractors` (scope `contractors:read`): `uuid`, `type` (`Individual`|`Business`), `wage_type` (`Fixed`|`Hourly`), `hourly_rate` (required if Hourly), `is_active`, `onboarding_status`. Payments: `POST /v1/companies/{company_id}/contractor_payments` (`contractor_uuid, date, hours, bonus, reimbursement, payment_method` [Direct Deposit | Check | Historical Payment]); preview `POST /v1/companies/{company_id}/contractor_payment_groups/preview` (returns `expected_debit_date`, `submission_blockers`, `creation_token`). Groups API recommended.
- Time off (https://docs.gusto.com/embedded-payroll/docs/time-off-requests): `GET/POST /v1/companies/{company_uuid}/time_off/requests`, `POST .../time_off/requests/preview`, `GET .../time_off/balances`, `POST .../time_off/admin_approved_requests`, `PUT /v1/time_off/requests/{uuid}/approve|decline`, `GET|DELETE /v1/time_off/requests/{uuid}`. "Approved time off is automatically reflected in payroll calculations" (shows up in `paid_time_off[].approved_request_hours`). Demo support not explicitly stated — UNVERIFIED but no demo exclusion is documented.
- Pay schedules: `GET /v1/companies/{company_id}/pay_schedules` — `uuid`, `frequency` (Every week / Every other week / Twice per month / Monthly / Quarterly / Annually), `anchor_pay_date`, `anchor_end_of_pay_period`, `day_1`, `day_2`, `name`, `active`.

### B6. Webhooks, rate limits, versioning, SDKs
- Webhooks in demo — VERIFIED (https://docs.gusto.com/embedded-payroll/docs/webhooks ; .../docs/testing-partner-notifications): `POST https://api.gusto-demo.com/v1/webhook_subscriptions` (subscription_types e.g. Company, Employee, Payroll...), subscription starts `pending`; Gusto POSTs a `verification_token` to your URL; activate with `PUT /v1/webhook_subscriptions/{webhook_subscription_uuid}/verify`. The notification test tool is "available in our demo environment only" and provisions `[Demo notification testing]` companies. Needs a public HTTPS URL (ngrok) — webhooks are not needed for the core flow.
- Rate limits — VERIFIED (https://docs.gusto.com/embedded-payroll/docs/rate-limits): "Each application can make 200 requests per minute per user", rolling 60-second window, 429 on excess, headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. No separate demo limit documented.
- Versioning — VERIFIED (https://docs.gusto.com/embedded-payroll/docs/api-versioning): header `X-Gusto-API-Version`; current reference pages default to `2026-06-15`.
- SDKs — VERIFIED:
  - TypeScript: `@gusto/embedded-api` (npm latest **0.16.3**; repo github.com/Gusto/gusto-typescript-client; Speakeasy-generated). README: "This library is currently in beta, and we are actively making improvements... may introduce breaking changes without prior notice" — pin versions. `npm add @gusto/embedded-api`; `import { GustoEmbedded } from "@gusto/embedded-api"`; `new GustoEmbedded({ companyAccessAuth: ..., server: "demo" })` (server option name UNVERIFIED for TS; Python documents `server="demo"` → api.gusto-demo.com); `systemAccessAuth` passed per-operation where needed; methods like `payrolls.list`. A version-pinned package `@gusto/embedded-api-v-2026-06-15` also exists (0.1.0).
  - Python: `pip install gusto_embedded`; `from gusto_embedded import Gusto`; `Gusto(company_access_auth=..., server="demo")`; version passed per call as `x_gusto_api_version=gusto_embedded.XGustoAPIVersion...`. Also beta.
  - React UI SDK `@gusto/embedded-react-sdk` (sdk.gusto.com) — not needed.
  - Given beta status + hackathon, plain `fetch` against api.gusto-demo.com with `X-Gusto-API-Version: 2026-06-15` is lowest-risk.

### B7. Onboarding caveats and demo fast-track — VERIFIED
Sources: https://docs.gusto.com/embedded-payroll/docs/onboard-a-company ; .../reference/get-v1-company-onboarding-status ; .../reference/get-v1-company-finish-onboarding
- A company created via `partner_managed_companies` must complete onboarding before payroll: steps (ids from `GET /v1/companies/{company_uuid}/onboarding_status`): `add_addresses`, `federal_tax_setup`, `select_industry`, `add_bank_info`, `verify_bank_info`, `add_employees`, `state_setup`, `payroll_schedule`, `sign_all_forms` (+ optional `external_payroll`); `onboarding_completed` boolean. "at least one employee must complete individual onboarding before the company can finish onboarding."
- Finish: `PUT /v1/companies/{company_uuid}/finish_onboarding`; in production Gusto Risk review "can take up to 2 business days though auto-approval can happen in as little as 15 minutes."
- Demo shortcut: **`PUT /v1/companies/{company_uuid}/approve`** — "We provide the endpoint PUT '/v1/companies/{company_uuid}/approve' to facilitate company approvals in the demo environment." Returns "Company object, with company_status: 'Approved'". Scope `companies:write`. ("Use PUT /v1/companies/{company_uuid}/approve to simulate approval instantly.")
- Employee onboarding: `PUT /v1/employees/{employee_id}/onboarding_status` ("Updates an employee's onboarding status."); legacy `PUT /v1/employees/{employee_id}/finish_onboarding` still works but is slated for deprecation (UNVERIFIED — search snippet).
- Fastest path: skip all of this by using a Developer-Portal-generated demo company, which is already onboarded with employees and payroll history (B1). Then `GET .../payrolls?processing_statuses=unprocessed` to find the current regular draft, `prepare`, `update`.

### B8. Demo-access timing — mostly UNVERIFIED
- VERIFIED: docs describe demo access as self-serve (sign up → Organization → Application → client_id/secret → demo company) with no approval step mentioned (B1). Scopes are not enforced in demo (B2).
- VERIFIED (App Integrations intro, https://docs.gusto.com/app-integrations/docs/introduction — different Gusto product but same Developer Portal): "Production access is gated, and not all applications are approved"; requires "Production Pre-Approval and Security Review". Gusto FAQ: build "typically takes between 1 and 2 months from the time your demo keys are issued to the time your production keys are issued" (UNVERIFIED exact quote — search snippet of gusto.com/about/bd FAQ).
- UNVERIFIED: no official statement of a wait time for demo keys. The Developer FAQ's wording ("fill out a Production Pre-Approval form, sign up for a Developer Portal account and onboard to our sandbox environment") could imply a form before the portal grants an Organization; the Embedded quickstart does not mention it. Risk mitigation for a hackathon: sign up at dev.gusto.com immediately; if the Organization/Application creation is blocked pending review, fall back to a local mock of the 6 payroll endpoints above using the documented response shapes.

---

## Quick cheat-sheet for the plan

QBO (sandbox):
- Tokens: Playground → `.env` (access 1h, refresh 100d rolling). Base `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}`.
- Read expenses: `GET .../query?query=select * from Purchase where TxnDate >= '2026-10-01' STARTPOSITION 1 MAXRESULTS 1000`; completeness: `select count(*) from Purchase where TxnDate >= '2026-10-01'` → `QueryResponse.totalCount`. Also `Bill` for AP.
- Job tag: `Line[].AccountBasedExpenseLineDetail.CustomerRef` (job = Customer with `Job=true` + `ParentRef`, or Project `IsProject=true`); category: `...AccountRef`; segment: `...ClassRef`; text: `Line[].Description`, `PrivateNote`; payer account: header `AccountRef`; vendor: `EntityRef`.
- Seed planted errors: `POST .../purchase` (500/min, 10/s).

Gusto (demo):
- Base `https://api.gusto-demo.com`, header `X-Gusto-API-Version: 2026-06-15`, Bearer company token (2h; refresh rotates).
- `GET /v1/companies/{c}/employees?include=all_compensations` → jobs/rates.
- `GET /v1/companies/{c}/payrolls?processing_statuses=unprocessed&payroll_types=regular,off_cycle` → draft `payroll_uuid`.
- `PUT /v1/companies/{c}/payrolls/{p}/prepare` → per-employee `version` + current comps.
- `PUT /v1/companies/{c}/payrolls/{p}` with `employee_compensations[{employee_uuid, version, hourly_compensations[{name,hours,job_uuid}], fixed_compensations[{name:"Bonus"|"Commission"|"Paycheck Tips"|"Cash Tips"|"Reimbursement", amount, job_uuid}]}]` → draft filled, still `processed:false`.
- Optional `PUT .../calculate` (202, preview). Never `PUT .../submit`.
- Off-cycle: `POST /v1/companies/{c}/payrolls {off_cycle:true, off_cycle_reason:"Bonus", start_date, end_date, check_date, employee_uuids:[...]}` then prepare/update.
