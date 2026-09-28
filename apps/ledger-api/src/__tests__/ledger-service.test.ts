import { describe, expect, it } from "vitest";
import { InMemoryLedgerRepository } from "@ledgerlab/db";
import { ConflictError, NotFoundError, UnbalancedEntryError, ValidationError } from "@ledgerlab/shared";
import { LedgerService } from "../services/ledger-service";

function buildService() {
  return new LedgerService(new InMemoryLedgerRepository({ seed: true }));
}

describe("LedgerService business rules", () => {
  it("refuses a single-line entry", async () => {
    const service = buildService();
    const [cash] = await service.listAccounts();
    await expect(
      service.createJournalEntry({
        date: "2026-02-01",
        memo: "one liner",
        lines: [{ accountId: cash!.id, amountMinor: 100 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses zero-amount lines", async () => {
    const service = buildService();
    const accounts = await service.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;
    await expect(
      service.createJournalEntry({
        date: "2026-02-01",
        memo: "zero line",
        lines: [
          { accountId: cash.id, amountMinor: 0 },
          { accountId: revenue.id, amountMinor: 0 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("flags an out-of-balance entry", async () => {
    const service = buildService();
    const accounts = await service.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;
    await expect(
      service.createJournalEntry({
        date: "2026-02-01",
        memo: "imbalanced",
        lines: [
          { accountId: cash.id, amountMinor: 100 },
          { accountId: revenue.id, amountMinor: -99 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedEntryError);
  });

  it("throws NotFound for unknown entries", async () => {
    await expect(buildService().getJournalEntryOrThrow("je_missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFound when voiding an unknown entry", async () => {
    await expect(buildService().voidJournalEntry("je_missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ConflictError when attempting to void an already-voided entry", async () => {
    const service = buildService();
    const entries = await service.listJournalEntries({ page: 1, pageSize: 20 });
    const target = entries.data[0]!;

    const voided = await service.voidJournalEntry(target.id);
    expect(voided.status).toBe("VOID");
    await expect(service.voidJournalEntry(target.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects journal entries referencing an inactive account", async () => {
    const repo = new InMemoryLedgerRepository({ seed: true });
    const service = new LedgerService(repo);
    const accounts = await service.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;

    cash.isActive = false;

    await expect(
      service.createJournalEntry({
        date: "2026-03-01",
        memo: "Attempt entry with inactive account",
        lines: [
          { accountId: cash.id, amountMinor: 5000 },
          { accountId: revenue.id, amountMinor: -5000 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects entries dated on or before a closed period cutoff", async () => {
    const service = new LedgerService(new InMemoryLedgerRepository({ seed: true }), {
      closedThrough: "2025-12-31",
    });
    const accounts = await service.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;

    await expect(
      service.createJournalEntry({
        date: "2025-12-31",
        memo: "Closed period transaction",
        lines: [
          { accountId: cash.id, amountMinor: 1000 },
          { accountId: revenue.id, amountMinor: -1000 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const valid = await service.createJournalEntry({
      date: "2026-01-01",
      memo: "Open period transaction",
      lines: [
        { accountId: cash.id, amountMinor: 1000 },
        { accountId: revenue.id, amountMinor: -1000 },
      ],
    });
    expect(valid.status).toBe("POSTED");
  });

  it("throws Conflict for duplicate account codes", async () => {
    const service = buildService();
    await expect(
      service.createAccount({ code: "1000", name: "Duplicate cash", type: "ASSET", currency: "USD" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
