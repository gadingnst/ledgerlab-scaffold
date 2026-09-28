import type {
  Account,
  CreateAccountInput,
  CreateJournalEntryInput,
  EntryStatus,
  JournalEntry,
  LedgerRepository,
  Paginated,
  PostingRow,
  TrialBalance,
} from "@ledgerlab/shared";
import {
  ConflictError,
  NotFoundError,
  UnbalancedEntryError,
  ValidationError,
  buildTrialBalance,
  isBalanced,
  sumMinor,
} from "@ledgerlab/shared";

export interface ListEntriesParams {
  page: number;
  pageSize: number;
  status?: EntryStatus;
}

/**
 * Application layer for the ledger. Owns the business rules:
 *   - a journal entry must have at least two lines
 *   - every line amount must be non-zero
 *   - debits must equal credits (sum of signed minor units === 0)
 *   - referenced accounts must exist
 *
 * The repository only persists; it does not decide what is valid.
 */
export class LedgerService {
  constructor(private readonly repo: LedgerRepository) {}

  get repositoryKind(): "memory" | "postgres" {
    return this.repo.kind;
  }

  listAccounts(): Promise<Account[]> {
    return this.repo.listAccounts();
  }

  async getAccountOrThrow(id: string): Promise<Account> {
    const account = await this.repo.getAccountById(id);
    if (!account) throw new NotFoundError(`Account ${id} not found`);
    return account;
  }

  createAccount(input: CreateAccountInput): Promise<Account> {
    return this.repo.createAccount(input);
  }

  listJournalEntries(params: ListEntriesParams): Promise<Paginated<JournalEntry>> {
    return this.repo.listJournalEntries(params);
  }

  async getJournalEntryOrThrow(id: string): Promise<JournalEntry> {
    const entry = await this.repo.getJournalEntry(id);
    if (!entry) throw new NotFoundError(`Journal entry ${id} not found`);
    return entry;
  }

  async createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
    if (input.lines.length < 2) {
      throw new ValidationError("A journal entry requires at least two lines");
    }
    for (const line of input.lines) {
      if (line.amountMinor === 0) {
        throw new ValidationError("Journal line amounts must not be zero");
      }
    }
    const amounts = input.lines.map((line) => line.amountMinor);
    if (!isBalanced(amounts)) {
      const total = sumMinor(amounts);
      throw new UnbalancedEntryError(
        `Entry is out of balance by ${total} minor units (debits must equal credits)`,
        total,
      );
    }
    // Ensure every referenced account exists before persisting.
    for (const line of input.lines) {
      await this.getAccountOrThrow(line.accountId);
    }
    return this.repo.createJournalEntry(input);
  }

  async voidJournalEntry(id: string): Promise<JournalEntry> {
    const entry = await this.repo.getJournalEntry(id);
    if (!entry) throw new NotFoundError(`Journal entry ${id} not found`);
    if (entry.status !== "POSTED") {
      throw new ConflictError(
        `Journal entry ${id} cannot be voided: current status is ${entry.status} (only POSTED entries may be voided)`,
      );
    }
    const voided = await this.repo.voidJournalEntry(id);
    if (!voided) throw new NotFoundError(`Journal entry ${id} not found`);
    return voided;
  }

  async trialBalance(asOf: string): Promise<TrialBalance> {
    const postings = await this.repo.listPostings();
    return buildTrialBalance(postings, asOf);
  }

  /** Raw postings for downstream services (used by the reporting API). */
  listPostings(): Promise<PostingRow[]> {
    return this.repo.listPostings();
  }
}
