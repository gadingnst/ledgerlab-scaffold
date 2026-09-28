import type { TrialBalance } from "./domain";
import { formatMinor } from "./money";

/** Escape a single cell for RFC 4180 CSV compliance. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert a 2D table of values into an RFC 4180 compliant CSV string. */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

/** Format a TrialBalance into a downloadable CSV string. */
export function trialBalanceToCsv(tb: TrialBalance): string {
  const headers = ["Account Code", "Account Name", "Account Type", "Debit", "Credit"];
  const rows: (string | number)[][] = tb.rows.map((row) => [
    row.code,
    row.name,
    row.type,
    row.debitMinor > 0 ? formatMinor(row.debitMinor) : "",
    row.creditMinor > 0 ? formatMinor(row.creditMinor) : "",
  ]);

  // Append summary total row
  rows.push([
    "TOTALS",
    tb.balanced ? "Balanced" : "Out of Balance",
    "",
    formatMinor(tb.totalDebitMinor),
    formatMinor(tb.totalCreditMinor),
  ]);

  return buildCsv(headers, rows);
}
