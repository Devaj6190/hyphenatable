// SYNTHETIC replicas of Company R's two export layouts (fake names, fake addresses, fake amounts), built from
// the layout description only. The real files are never read by code or tests.
// Regenerate: bun run packages/connectors/src/exports/__fixtures__/make-r-replicas.ts

export const JOBBER_TIMESHEETS_CSV = [
  "Totals",
  "",
  // totals come from exact seconds, rows are rounded to 0.01 h: totals may be off by rounding drift
  "Total Hours,25.26",
  "Avery Reed Team Leader,12.51",
  // one person, two Jobber accounts (name variants), each with its own total line
  "Jordan Ellis,4.25",
  "Jordan Ellis ,5.00",
  "Sam Okafor,3.50",
  "",
  "Name,Date,Start time,End time,Hours,Working on,Note,Client name",
  'Avery Reed Team Leader,"Aug 31, 2026", 9:30AM,12:00PM,2.50,Job #518 - Brookside Dental,"",Brookside Dental',
  'Avery Reed ,"Sep 1, 2026", 7:00AM,5:00PM,10.00,General,"",',
  'Jordan Ellis,"Sep 1, 2026", 8:00AM,12:15PM,4.25,Driving,"",',
  'Jordan Ellis ,"Sep 2, 2026", 1:00PM,6:00PM,5.00,Maple Grove HOA - Off-Site,"gate code fake",Maple Grove HOA',
  'Sam Okafor,"Sep 2, 2026", 9:00AM, 9:00AM,0.0,Request for hedge quote,"",Maple Grove HOA',
  'Sam Okafor,"Sep 3, 2026", 8:00AM,11:30AM,3.50,Job #521 - Maple Grove HOA,"",Maple Grove HOA',
  "Report totals:,,,,25.26,,,",
].join("\n");

export const JOURNAL_HEADER = [
  "Last Name",
  "First Name",
  "Work Address",
  "Employee Type",
  "Payment",
  "Employee Taxes",
  "Federal Income Tax",
  "Social Security",
  "Medicare",
  "State Income Tax",
  "State Disability",
  "Local Tax",
  "Additional Medicare",
  "Other Employee Tax",
  "Employer Taxes",
  "Social Security (ER)",
  "Medicare (ER)",
  "FUTA",
  "SUTA",
  "One Time Reimbursement",
  "Net Pay",
  "Reimbursements",
  "Donations",
  "Check Amount",
  "Employer Cost",
  "Job",
  "Pay Type",
  "Hours",
  "Rate",
  "Amount",
];

const TAXES = [
  "901.11",
  "902.22",
  "903.33",
  "904.44",
  "905.55",
  "906.66",
  "907.77",
  "908.88",
];
const ER_TAXES = ["911.11", "912.22", "913.33", "914.44"];
const q = (v: string) => (/[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** one 30-column line: fields by header name; everything else blank */
function line(f: Partial<Record<string, string>>): string {
  return JOURNAL_HEADER.map((h) => q(f[h] ?? "")).join(",");
}
/** an employee's first row carries the person and the money columns that must never be read */
const person = (
  last: string,
  first: string,
  type: string,
  payment: string,
  pay: Record<string, string> = {},
) =>
  line({
    "Last Name": last,
    "First Name": first,
    "Work Address": "1 Fake Street, Faketown",
    "Employee Type": type,
    Payment: payment,
    "Employee Taxes": "1234.56",
    ...Object.fromEntries(
      JOURNAL_HEADER.slice(6, 14).map((h, i) => [h, TAXES[i] as string]),
    ),
    "Employer Taxes": "2345.67",
    ...Object.fromEntries(
      JOURNAL_HEADER.slice(15, 19).map((h, i) => [h, ER_TAXES[i] as string]),
    ),
    "Net Pay": "777.77",
    "Check Amount": "777.77",
    "Employer Cost": "8888.88",
    Donations: "5.55",
    ...pay,
  });
const pay = (type: string, hours: string, rate: string, amount: string) =>
  line({
    Job: "Crew",
    "Pay Type": type,
    Hours: hours,
    Rate: rate,
    Amount: amount,
  });

export const GUSTO_JOURNAL_SECTIONED_CSV = [
  "Payroll Journal Report",
  "Fake Landscaping Co",
  "08/29/2026 - 09/25/2026",
  "",
  "Regular",
  "Pay period, 08/29/2026 - 09/11/2026",
  "Pay day, 09/16/2026",
  JOURNAL_HEADER.join(","),
  person("Reed", "Avery", "Paid by the hour", "1112.50", {
    Job: "Crew",
    "Pay Type": "Regular",
    Hours: "40.000",
    Rate: "25.00",
    Amount: "1,000.00",
  }),
  pay("Overtime", "2.000", "37.50", "75.00"),
  pay("Overtime (adjustment 08/15/26 - 08/28/26)", "1.000", "37.50", "37.50"),
  // most employees have no Gross line; this multi-line one does (it must agree with Payment)
  pay("Gross", "", "", "1,112.50"),
  person("Okafor", "Sam", "Owner’s draw", "2000.00"),
  pay("Owner's Draw", "", "", "2,000.00"),
  line({
    "Last Name": "Payroll Totals",
    Payment: "3112.50",
    "Employee Taxes": "3333.33",
    "Net Pay": "9999.99",
    "Pay Type": "Gross",
    Amount: "3,112.50",
  }),
  "",
  "Off-Cycle (Bonus)",
  "Pay period, 08/29/2026 - 09/11/2026",
  "Pay day, 09/18/2026",
  JOURNAL_HEADER.join(","),
  // Payment empty: the Gross line is the fallback
  person("Reed", "Avery", "Paid by the hour", ""),
  pay("Commission", "", "", "150.00"),
  pay("Additional Earnings", "", "", "50.00"),
  pay("Gross", "", "", "200.00"),
  line({
    "Last Name": "Payroll Totals",
    Payment: "200.00",
    "Net Pay": "150.00",
  }),
  "",
  "Regular (Sep 12 - Sep 25)",
  "Pay period, 09/12/2026 - 09/25/2026",
  "Pay day, 09/30/2026",
  JOURNAL_HEADER.join(","),
  person("Reed", "Avery", "Paid by the hour", "1000.00"),
  pay("Regular", "40.000", "25.00", "1,000.00"),
  person("Ellis", "Jordan", "Paid by the hour", "660.00"),
  pay("Regular", "30.000", "22.00", "660.00"),
  line({ "Last Name": "Payroll Totals", Payment: "1660.00" }),
  line({ "Pay Type": "Gross", Amount: "1,660.00" }),
].join("\n");

if (import.meta.main) {
  await Bun.write(
    new URL("./r-jobber-timesheets.replica.csv", import.meta.url),
    `${JOBBER_TIMESHEETS_CSV}\n`,
  );
  await Bun.write(
    new URL("./r-gusto-payroll-journal.replica.csv", import.meta.url),
    `${GUSTO_JOURNAL_SECTIONED_CSV}\n`,
  );
  console.log("wrote the two replicas");
}
