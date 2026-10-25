// SYNTHETIC replicas of Company R's Jobber report CSV layouts (fake names, clients, addresses, amounts), built
// from the layout descriptions only. The real files are never read by code or tests.

export const EXPENSE_REPORT_CSV = [
  "Totals",
  "",
  "Total Expense Value,$412.37",
  "",
  "Item name,Details,Total $,Entered by,Reimbursable to,Job #,Job address,Date,Client name,Job description",
  'Mulch,"3 yards, black",$214.37,Avery Reed,N/A,#527,"12 Fake Lane, Faketown","Sep 21, 2026",Brookside Dental,Spring cleanup for Brookside',
  'Gas,,$48.00,Jordan Ellis,Jordan Ellis,,,"Sep 22, 2026",,',
  'Helper,"6 hours x $25 Pat Quinlan",$150.00,Avery Reed,N/A,#530,"9 Fake Road, Faketown","Sep 23, 2026",Maple Grove HOA,Mulch install',
  'Report totals:,,"$412.37",,,,,,,',
].join("\n");

export const TRANSACTION_LIST_CSV = [
  "Client name,Date,Type,Total $,Check #,Method,Job #,Postal code,Paid - Tax $",
  'Brookside Dental,09/21/2026,Invoice,"$1,250.40",,,#527,02134,',
  'Brookside Dental,09/25/2026,Payment,"-$950.40",1042,Check,#527,02134,',
  'Brookside Dental,09/10/2026,Deposit,"-$300.00",,Credit card,#527,02134,',
  "Maple Grove HOA,09/30/2026,Refund,$50.00,,Cash,,02135,",
].join("\n");

export const INVOICES_REPORT_CSV = [
  // real header shapes: "Tax (%)" (a rate with a jurisdiction word) sits before "Tax amount ($)"; "-" is empty
  "Invoice #,Client name,Job #,Created date,Issued date,Due date,Marked paid date,Salesperson,Pre-tax total ($),Tax (%),Tax amount ($),Total ($),Balance ($),Status,Subject",
  '1042,Brookside Dental,#527,"Sep 20, 2026","Sep 21, 2026","Oct 05, 2026","Sep 25, 2026 4:12 PM",Jordan Ellis,"$1,200.00",Fakecounty (4.2%),$50.40,"$1,250.40",$0.00,Paid,Spring cleanup at Brookside',
  '1043,Maple Grove HOA,#530,"Sep 28, 2026","Sep 29, 2026","Oct 13, 2026",-,Avery Reed,$600.00,-,$0.00,$600.00,$600.00,Awaiting payment,Mulch install',
  'Report totals:,,,,,,,,"$1,800.00",,$50.40,"$1,850.40",$600.00,,',
].join("\n");

export const QUOTES_REPORT_CSV = [
  "Quote #,Client name,Salesperson,Drafted date,Sent date,Approved date,Converted date,Total $,Status,Job #,Title",
  '88,Brookside Dental,Jordan Ellis,"Sep 1, 2026","Sep 2, 2026","Sep 5, 2026","Sep 6, 2026","$1,250.40",Converted,#527,Spring cleanup',
  '89,Maple Grove HOA,Avery Reed,"Sep 25, 2026",-,-,–,$900.00,Draft,,Hedge trim',
  'Report totals:,,,,,,,"$2,150.40",,,',
].join("\n");

export const ONE_OFF_JOBS_CSV = [
  "Job #,Client name,Title,Created date,Start date,End date,Closed date,Total $,Status,Salesperson",
  '527,Brookside Dental,Spring cleanup,"Sep 5, 2026","Sep 21, 2026","Sep 22, 2026","Sep 25, 2026","$1,250.40",Archived,Jordan Ellis',
  '530,Maple Grove HOA,Mulch install,"Sep 27, 2026","Sep 29, 2026",-,-,$600.00,Requires invoicing,Avery Reed',
  'Report totals:,,,,,,,"$1,850.40",,',
].join("\n");

export const RECURRING_JOBS_CSV = [
  "Job #,Client name,Title,Created date,Start date,End date,Closed date,Total $,Status",
  '512,Maple Grove HOA,Weekly lawn care,"Jun 1, 2026","Jun 15, 2026","Oct 31, 2026",-,"$3,200.00",Active',
  'Report totals:,,,,,,,"$3,200.00",',
].join("\n");
