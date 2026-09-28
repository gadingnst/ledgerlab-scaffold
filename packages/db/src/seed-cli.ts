import { SEED_ACCOUNTS, buildSeedEntries } from "@ledgerlab/shared";
import { createDatabase } from "./client";
import { PostgresLedgerRepository } from "./postgres-repository";
import { journalEntries, journalLines } from "./schema";

/**
 * Seed a Postgres database with the demo chart of accounts and journal entries.
 * Skips accounts that already exist, so it is safe to re-run.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to seed Postgres");
  const { db, close } = createDatabase(url, { max: 1 });
  const repo = new PostgresLedgerRepository(db);
  try {
    const existing = new Set((await repo.listAccounts()).map((a) => a.code));
    for (const account of SEED_ACCOUNTS) {
      if (!existing.has(account.code)) await repo.createAccount(account);
    }
    const accountsByCode = new Map((await repo.listAccounts()).map((a) => [a.code, a]));
    const force = process.argv.includes("--force") || process.argv.includes("-f");
    const { total } = await repo.listJournalEntries({ page: 1, pageSize: 1 });
    if (total > 0 && !force) {
      console.log(`Seed skipped: ${total} journal entries already present. Pass --force to reset and re-seed.`);
      return;
    }
    if (total > 0 && force) {
      console.log(`[seed] --force specified: resetting existing journal entries...`);
      await db.delete(journalLines);
      await db.delete(journalEntries);
    }
    for (const entry of buildSeedEntries()) {
      await repo.createJournalEntry({
        date: entry.date,
        memo: entry.memo,
        reference: entry.reference,
        lines: entry.lines.map((line) => {
          const account = accountsByCode.get(line.accountCode);
          if (!account) throw new Error(`Seed account ${line.accountCode} missing`);
          return { accountId: account.id, amountMinor: line.amountMinor, memo: line.memo };
        }),
      });
    }
    console.log(`Seeded ${accountsByCode.size} accounts and ${buildSeedEntries().length} entries.`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
