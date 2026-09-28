import { Link } from "react-router-dom";
import { Badge, Card, PageHeader, Stat, TBody, TD, TH, THead, TR, TableWrap, Button } from "@ledgerlab/ui";
import { Async } from "../components/states";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { formatDate, money, today } from "../lib/format";

export function DashboardPage() {
  const asOf = today();
  const summary = useAsync(() => api.reporting.dashboard(asOf), [asOf]);
  const recent = useAsync(() => api.ledger.listJournalEntries({ page: 1, pageSize: 6 }), []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`Position as of ${formatDate(asOf)}`}
        actions={
          <Link to="/ledger/new">
            <Button variant="primary">New journal entry</Button>
          </Link>
        }
      />

      <Async
        loading={summary.loading}
        error={summary.error}
        data={summary.data}
        onRetry={summary.reload}
        skeleton="stat"
      >
        {(data) => (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <Stat
                  label="Total assets"
                  value={money(data.totalAssetsMinor)}
                  hint="Assets (debit-normal)"
                />
              </Card>
              <Card>
                <Stat label="Cash" value={money(data.cashMinor)} hint="Account 1000" />
              </Card>
              <Card>
                <Stat
                  label="Net income (MTD)"
                  value={money(data.netIncomeMonthToDateMinor)}
                  tone={data.netIncomeMonthToDateMinor >= 0 ? "positive" : "negative"}
                  hint={`Revenue ${money(data.revenueMonthToDateMinor)}`}
                />
              </Card>
              <Card>
                <Stat
                  label="Liabilities + equity"
                  value={money(data.totalLiabilitiesMinor + data.totalEquityMinor)}
                  hint={`Liabilities ${money(data.totalLiabilitiesMinor)}`}
                />
              </Card>
            </div>

            <Card
              title="Ledger integrity"
              description="A double-entry ledger is only trustworthy when debits equal credits."
              actions={
                <Badge tone={data.balanced ? "positive" : "negative"}>
                  {data.balanced ? "In balance" : "Out of balance"}
                </Badge>
              }
            >
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-zinc-500">Accounts in use</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-900">{data.accountCount}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Posted entries</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-900">{data.entryCount}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Expenses (MTD)</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-900">
                    {money(data.expensesMonthToDateMinor)}
                  </dd>
                </div>
              </dl>
            </Card>
          </>
        )}
      </Async>

      <Card
        title="Recent journal entries"
        padded={false}
        actions={
          <Link to="/ledger" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            View all
          </Link>
        }
      >
        <Async
          loading={recent.loading}
          error={recent.error}
          data={recent.data}
          onRetry={recent.reload}
          skeleton="table"
        >
          {(page) => (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Memo</TH>
                  <TH>Reference</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {page.data.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap">{formatDate(entry.date)}</TD>
                    <TD className="font-medium text-zinc-900">{entry.memo}</TD>
                    <TD muted>{entry.reference ?? "—"}</TD>
                    <TD>
                      <Badge
                        tone={
                          entry.status === "POSTED"
                            ? "positive"
                            : entry.status === "VOID"
                              ? "negative"
                              : "warning"
                        }
                      >
                        {entry.status.toLowerCase()}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Async>
      </Card>
    </div>
  );
}
