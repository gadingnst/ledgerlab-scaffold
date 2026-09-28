import { describe, expect, it } from "vitest";
import { InMemoryLedgerRepository } from "@ledgerlab/db";
import { LedgerService } from "../services/ledger-service";

async function serviceWithEntries() {
  const repository = new InMemoryLedgerRepository({ seed: true });
  const service = new LedgerService(repository);
  const accounts = await service.listAccounts();
  const cash = accounts.find((a) => a.code === "1000")!;
  const revenue = accounts.find((a) => a.code === "4000")!;
  await service.createJournalEntry({
    date: "2026-03-15",
    memo: "March revenue",
    lines: [
      { accountId: cash.id, amountMinor: 100_00 },
      { accountId: revenue.id, amountMinor: -100_00 },
    ],
  });
  await service.createJournalEntry({
    date: "2026-04-15",
    memo: "April revenue",
    lines: [
      { accountId: cash.id, amountMinor: 900_00 },
      { accountId: revenue.id, amountMinor: -900_00 },
    ],
  });
  return service;
}

describe("CHALLENGE A: trial balance respects asOf", () => {
  it("excludes postings dated after asOf", async () => {
    const service = await serviceWithEntries();
    const march = await service.trialBalance("2026-03-31");
    const april = await service.trialBalance("2026-04-30");

    // March must not include the 900.00 April entry.
    expect(april.totalDebitMinor - march.totalDebitMinor).toBe(900_00);
    expect(march.balanced).toBe(true);
  });

  it("returns an empty, balanced report before any activity", async () => {
    const service = await serviceWithEntries();
    const report = await service.trialBalance("2020-01-01");
    expect(report.rows).toHaveLength(0);
    expect(report.totalDebitMinor).toBe(0);
  });
});
