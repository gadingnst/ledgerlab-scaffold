import { Fragment, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  cn,
} from "@ledgerlab/ui";
import { Async } from "../components/states";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { formatDate, money } from "../lib/format";

const PAGE_SIZE = 20;

export function LedgerPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "POSTED" | "VOID">("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);

  const { data, loading, error, reload } = useAsync(
    () =>
      api.ledger.listJournalEntries({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
      }),
    [page, statusFilter, fromDate, toDate],
  );

  async function voidEntry(id: string) {
    if (!window.confirm("Void this entry? It will no longer affect reports.")) return;
    setBusyId(id);
    try {
      await api.ledger.voidJournalEntry(id);
      reload();
    } finally {
      setBusyId(undefined);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="General ledger"
        description="Every posted journal entry, newest first."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-36">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "ALL" | "POSTED" | "VOID");
                  setPage(1);
                }}
              >
                <option value="ALL">All statuses</option>
                <option value="POSTED">Posted only</option>
                <option value="VOID">Voided only</option>
              </Select>
            </div>
            <div className="w-36">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                placeholder="From date"
              />
            </div>
            <div className="w-36">
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                placeholder="To date"
              />
            </div>
            {(statusFilter !== "ALL" || fromDate || toDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setFromDate("");
                  setToDate("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        }
      />

      <Card padded={false}>
        <Async loading={loading} error={error} data={data} onRetry={reload} skeleton="table">
          {(result) => (
            <>
              <TableWrap>
                <THead>
                  <TR>
                    <TH className="w-28">Date</TH>
                    <TH>Memo</TH>
                    <TH className="w-28">Reference</TH>
                    <TH className="w-24">Status</TH>
                    <TH numeric className="w-28">
                      Amount
                    </TH>
                    <TH className="w-32" />
                  </TR>
                </THead>
                <TBody>
                  {result.data.length === 0 ? (
                    <TR>
                      <TD colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                        No journal entries found matching current filters.
                      </TD>
                    </TR>
                  ) : (
                    result.data.map((entry) => {
                      const total = entry.lines
                        .filter((line) => line.amountMinor > 0)
                        .reduce((sum, line) => sum + line.amountMinor, 0);
                      const isOpen = expanded === entry.id;
                      return (
                        <Fragment key={entry.id}>
                          <TR
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExpanded(isOpen ? undefined : entry.id);
                              }
                            }}
                            className="cursor-pointer hover:bg-zinc-50/80 focus:bg-zinc-50 focus:outline-none"
                            onClick={() => setExpanded(isOpen ? undefined : entry.id)}
                          >
                            <TD className="whitespace-nowrap">{formatDate(entry.date)}</TD>
                            <TD>
                              <span className="font-medium text-zinc-900 hover:text-indigo-700">
                                {entry.memo}
                              </span>
                              <span className="ml-2 text-xs text-zinc-400">{entry.lines.length} lines</span>
                            </TD>
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
                            <TD numeric>{money(total)}</TD>
                            <TD onClick={(e) => e.stopPropagation()}>
                              {entry.status === "POSTED" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={busyId === entry.id}
                                  onClick={() => void voidEntry(entry.id)}
                                >
                                  Void
                                </Button>
                              ) : null}
                            </TD>
                          </TR>
                          {isOpen ? (
                            <TR className="bg-zinc-50/70">
                              <TD colSpan={6} className="p-0">
                                <div className="px-4 py-3">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs uppercase tracking-wide text-zinc-500">
                                        <th className="py-1 text-left font-medium">Account</th>
                                        <th className="py-1 text-right font-medium">Debit</th>
                                        <th className="py-1 text-right font-medium">Credit</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entry.lines.map((line) => (
                                        <tr key={line.id} className="border-t border-zinc-200/70">
                                          <td className="py-1.5 text-zinc-700">
                                            <span className="font-mono text-xs text-zinc-500">
                                              {line.accountCode ?? "----"}
                                            </span>{" "}
                                            {line.accountName ?? line.accountId}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums text-zinc-800">
                                            {line.amountMinor > 0 ? money(line.amountMinor) : ""}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums text-zinc-800">
                                            {line.amountMinor < 0 ? money(Math.abs(line.amountMinor)) : ""}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </TD>
                            </TR>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </TBody>
              </TableWrap>
              <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-sm text-zinc-600">
                <span>
                  Page {result.page} of {totalPages} · {result.total} entries
                </span>
                <div className="flex gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Async>
      </Card>
    </div>
  );
}
