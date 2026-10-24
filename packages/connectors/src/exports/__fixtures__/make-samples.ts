// Builds the synthetic Jobber Timesheets sample (fake names). Layout is a guess at Jobber's
// "Receive Excel Copy" (title rows, header, rows, total) until a real file is seen.
// Regenerate: bun run packages/connectors/src/exports/__fixtures__/make-samples.ts
import ExcelJS from "exceljs";

export type SampleRow = (string | number | Date | boolean | null)[];

export const SAMPLE_HEADER = ["Date", "Employee", "Client", "Job", "Type", "Start Time", "End Time", "Hours", "Approved", "Notes"];
export const SAMPLE_ROWS: SampleRow[] = [
  [new Date(Date.UTC(2026, 9, 12)), "Avery Reed", "Client Alpha", "Job #101 - Spring cleanup", "General", "8:00 AM", "4:30 PM", 8.5, "Yes", null],
  [new Date(Date.UTC(2026, 9, 13)), "Avery Reed", "Client Beta", "Job #102 - Total care", "General", "8:00 AM", "4:15 PM", 8.25, "Yes", "fake note"],
  ["10/14/2026", "Jordan Ellis", null, null, "Custom", "07:30", "09:00", null, "No", null],
  ["Oct 15, 2026", "Jordan Ellis", "Client Alpha", "Job #101 - Spring cleanup", "General", null, null, 3.17, "Pending", null],
];

export async function buildTimesheetsXlsx(rows: SampleRow[] = SAMPLE_ROWS, total: number | null = 21.42): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Summary").addRow(["Timesheets report"]);
  const ws = wb.addWorksheet("Timesheets");
  ws.addRow(["Timesheets"]);
  ws.addRow(["Oct 11, 2026 - Oct 24, 2026"]);
  ws.addRow([]);
  ws.addRow(SAMPLE_HEADER);
  for (const r of rows) ws.addRow(r);
  if (total !== null) ws.addRow(["Total", null, null, null, null, null, null, total, null, null]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

if (import.meta.main) {
  const out = new URL("./jobber-timesheets.sample.xlsx", import.meta.url);
  await Bun.write(out, await buildTimesheetsXlsx());
  console.log(`wrote ${out.pathname}`);
}
