import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvCell, trialBalanceToCsv } from "./csv";
import type { TrialBalance } from "./domain";

describe("CSV generator", () => {
  it("escapes cells containing commas, quotes, and newlines", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell("with,comma")).toBe('"with,comma"');
    expect(escapeCsvCell('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsvCell("with\nnewline")).toBe('"with\nnewline"');
    expect(escapeCsvCell(1234)).toBe("1234");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("builds formatted CSV rows with headers", () => {
    const csv = buildCsv(
      ["Col1", "Col2"],
      [
        ["A", "B"],
        ["C,1", "D"],
      ],
    );
    expect(csv).toBe('Col1,Col2\r\nA,B\r\n"C,1",D');
  });

  it("exports trial balance with minor units converted to standard currency format", () => {
    const tb: TrialBalance = {
      asOf: "2026-09-28",
      rows: [
        {
          accountId: "acc-1",
          code: "1000",
          name: "Cash",
          type: "ASSET",
          debitMinor: 500000,
          creditMinor: 0,
          balanceMinor: 500000,
        },
        {
          accountId: "acc-2",
          code: "3000",
          name: "Owner's Equity",
          type: "EQUITY",
          debitMinor: 0,
          creditMinor: 500000,
          balanceMinor: -500000,
        },
      ],
      totalDebitMinor: 500000,
      totalCreditMinor: 500000,
      balanced: true,
    };

    const csv = trialBalanceToCsv(tb);
    expect(csv).toContain("Account Code,Account Name,Account Type,Debit,Credit");
    expect(csv).toContain("1000,Cash,ASSET,5000.00,");
    expect(csv).toContain("3000,Owner's Equity,EQUITY,,5000.00");
    expect(csv).toContain("TOTALS,Balanced,,5000.00,5000.00");
  });
});
