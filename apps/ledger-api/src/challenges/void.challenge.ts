import { describe, expect, it } from "vitest";
import type { JournalEntry, Paginated } from "@ledgerlab/shared";
import { InMemoryLedgerRepository } from "@ledgerlab/db";
import { createLedgerApp } from "../app";
import { LedgerService } from "../services/ledger-service";

function build() {
  return createLedgerApp({ service: new LedgerService(new InMemoryLedgerRepository({ seed: true })) });
}

async function listEntries(app: ReturnType<typeof build>): Promise<Paginated<JournalEntry>> {
  return (await (await app.request("/api/journal-entries")).json()) as Paginated<JournalEntry>;
}

describe("CHALLENGE B: void is a guarded transition", () => {
  it("voids a posted entry exactly once", async () => {
    const app = build();
    const list = await listEntries(app);
    const id = list.data[0]!.id;

    const first = await app.request(`/api/journal-entries/${id}/void`, { method: "POST" });
    expect(first.status).toBe(200);

    const second = await app.request(`/api/journal-entries/${id}/void`, { method: "POST" });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  it("excludes a voided entry from the ledger list when filtered by POSTED", async () => {
    const app = build();
    const list = await listEntries(app);
    const id = list.data[0]!.id;
    await app.request(`/api/journal-entries/${id}/void`, { method: "POST" });

    const posted = (await (
      await app.request("/api/journal-entries?status=POSTED")
    ).json()) as Paginated<JournalEntry>;
    expect(posted.data.some((entry) => entry.id === id)).toBe(false);
  });
});
