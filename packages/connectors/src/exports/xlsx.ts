// xlsx / zip-of-xlsx loading shared by the export readers: every worksheet as a grid of plain cells.

import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { Cell } from "./common.ts";

/** exceljs cell -> plain value (rich text, formulas and hyperlinks unwrapped). */
export function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return plain(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    return null;
  }
  return v as Cell;
}

export interface SheetGrid {
  /** workbook entry name inside a zip ("" for a bare .xlsx) */
  workbook: string;
  sheet: string;
  grid: Cell[][];
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b; // "PK": xlsx is a zip too, so look inside

/**
 * Grids of every sheet. A bare .xlsx is one workbook; a zip whose entries are .xlsx files (QuickBooks
 * "Export data") is several. Detection: a zip holding [Content_Types].xml is itself a workbook.
 */
export async function workbookGrids(bytes: Uint8Array): Promise<SheetGrid[]> {
  if (!isZip(bytes)) throw new Error("not an xlsx or zip file");
  const zip = await JSZip.loadAsync(bytes);
  const books: { name: string; data: Uint8Array }[] = zip.file(
    "[Content_Types].xml",
  )
    ? [{ name: "", data: bytes }]
    : await Promise.all(
        Object.values(zip.files)
          .filter(
            (f) =>
              !f.dir &&
              /\.xlsx$/i.test(f.name) &&
              !/(^|\/)__MACOSX\//.test(f.name),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(async (f) => ({
            name: f.name,
            data: await f.async("uint8array"),
          })),
      );
  const out: SheetGrid[] = [];
  for (const book of books) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(book.data as unknown as ArrayBuffer);
    for (const ws of wb.worksheets) {
      const grid: Cell[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        grid[n - 1] = Array.from({ length: row.cellCount }, (_, i) =>
          plain(row.getCell(i + 1).value),
        );
      });
      out.push({ workbook: book.name, sheet: ws.name, grid });
    }
  }
  return out;
}
