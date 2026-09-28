import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, PostgresLedgerRepository } from "@ledgerlab/db";
import { ConflictError, UnbalancedEntryError, sumMinor } from "@ledgerlab/shared";
import { LedgerService } from "../services/ledger-service";

const dbUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(dbUrl))("PostgresLedgerRepository & double-entry invariants", () => {
  let dbClient: ReturnType<typeof createDatabase>;
  let repo: PostgresLedgerRepository;
  let service: LedgerService;

  beforeAll(async () => {
    dbClient = createDatabase(dbUrl!);
    repo = new PostgresLedgerRepository(dbClient.db);
    service = new LedgerService(repo);
  });

  afterAll(async () => {
    await dbClient?.close();
  });

  it("enforces the balancing invariant directly in PostgresLedgerRepository", async () => {
    const accounts = await repo.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;

    await expect(
      repo.createJournalEntry({
        date: "2026-06-01",
        memo: "Unbalanced postgres test",
        lines: [
          { accountId: cash.id, amountMinor: 50_000 },
          { accountId: revenue.id, amountMinor: -49_999 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedEntryError);
  });

  it("persists a balanced entry in Postgres and proves sum of minor units is 0", async () => {
    const accounts = await repo.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;

    const entry = await service.createJournalEntry({
      date: "2026-06-02",
      memo: "Balanced revenue in Postgres",
      lines: [
        { accountId: cash.id, amountMinor: 25_000 },
        { accountId: revenue.id, amountMinor: -25_000 },
      ],
    });

    expect(entry.status).toBe("POSTED");
    expect(entry.lines).toHaveLength(2);
    expect(sumMinor(entry.lines.map((l) => l.amountMinor))).toBe(0);

    const fetched = await service.getJournalEntryOrThrow(entry.id);
    expect(sumMinor(fetched.lines.map((l) => l.amountMinor))).toBe(0);
  });

  it("enforces guarded void transition in Postgres repository", async () => {
    const accounts = await repo.listAccounts();
    const cash = accounts.find((a) => a.code === "1000")!;
    const revenue = accounts.find((a) => a.code === "4000")!;

    const entry = await service.createJournalEntry({
      date: "2026-06-03",
      memo: "To be voided in Postgres",
      lines: [
        { accountId: cash.id, amountMinor: 10_000 },
        { accountId: revenue.id, amountMinor: -10_000 },
      ],
    });

    const voided = await service.voidJournalEntry(entry.id);
    expect(voided.status).toBe("VOID");

    await expect(service.voidJournalEntry(entry.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.voidJournalEntry(entry.id)).rejects.toBeInstanceOf(ConflictError);
  });
});
