import { useState } from "react";
import { Badge, Card, Field, Input, PageHeader, TBody, TD, TH, THead, TR, TableWrap } from "@ledgerlab/ui";
import { Async } from "../components/states";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { formatDate, money, monthStart, today } from "../lib/format";

export function ReportsPage() {
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const balanceSheet = useAsync(() => api.reporting.balanceSheet(asOf), [asOf]);
  const income = useAsync(() => api.reporting.incomeStatement(from, to), [from, to]);
  const trial = useAsync(() => api.ledger.trialBalance(asOf), [asOf]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Derived from posted entries only." />

      <Card title="Parameters">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Income statement from" htmlFor="from">
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Income statement to" htmlFor="to">
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Balance sheet as of" htmlFor="asOf">
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Balance sheet"
        description={`As of ${formatDate(asOf)}`}
        actions={
          <Async
            loading={balanceSheet.loading}
            error={balanceSheet.error}
            data={balanceSheet.data}
            onRetry={balanceSheet.reload}
          >
            {(data) => (
              <Badge tone={data.outOfBalanceMinor === 0 ? "positive" : "negative"}>
                {data.outOfBalanceMinor === 0 ? "Balanced" : `Off by ${money(data.outOfBalanceMinor)}`}
              </Badge>
            )}
          </Async>
        }
        padded={false}
      >
        <Async
          loading={balanceSheet.loading}
          error={balanceSheet.error}
          data={balanceSheet.data}
          onRetry={balanceSheet.reload}
          skeleton="table"
        >
          {(data) => (
            <TableWrap>
              <THead>
                <TR>
                  <TH className="w-24">Code</TH>
                  <TH>Account</TH>
                  <TH numeric>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {[...data.assets, ...data.liabilities, ...data.equity].map((row) => (
                  <TR key={row.accountId}>
                    <TD className="font-mono text-xs text-zinc-500">{row.code}</TD>
                    <TD>{row.name}</TD>
                    <TD numeric>{money(row.balanceMinor)}</TD>
                  </TR>
                ))}
                <TR className="bg-zinc-50 font-medium">
                  <TD colSpan={2}>Assets − (Liabilities + Equity)</TD>
                  <TD numeric>{money(data.outOfBalanceMinor)}</TD>
                </TR>
              </TBody>
            </TableWrap>
          )}
        </Async>
      </Card>

      <Card title="Income statement" description={`${formatDate(from)} → ${formatDate(to)}`} padded={false}>
        <Async
          loading={income.loading}
          error={income.error}
          data={income.data}
          onRetry={income.reload}
          skeleton="table"
        >
          {(data) => (
            <TableWrap>
              <THead>
                <TR>
                  <TH className="w-24">Code</TH>
                  <TH>Line</TH>
                  <TH numeric>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {data.revenue.map((row) => (
                  <TR key={row.accountId}>
                    <TD className="font-mono text-xs text-zinc-500">{row.code}</TD>
                    <TD>{row.name}</TD>
                    <TD numeric>{money(Math.abs(row.balanceMinor))}</TD>
                  </TR>
                ))}
                <TR className="bg-zinc-50">
                  <TD colSpan={2} className="font-medium">
                    Total revenue
                  </TD>
                  <TD numeric>{money(data.totalRevenueMinor)}</TD>
                </TR>
                {data.expenses.map((row) => (
                  <TR key={row.accountId}>
                    <TD className="font-mono text-xs text-zinc-500">{row.code}</TD>
                    <TD>{row.name}</TD>
                    <TD numeric>{money(Math.abs(row.balanceMinor))}</TD>
                  </TR>
                ))}
                <TR className="bg-zinc-50">
                  <TD colSpan={2} className="font-medium">
                    Total expenses
                  </TD>
                  <TD numeric>{money(data.totalExpensesMinor)}</TD>
                </TR>
                <TR className="bg-zinc-50 font-semibold">
                  <TD colSpan={2}>Net income</TD>
                  <TD numeric>{money(data.netIncomeMinor)}</TD>
                </TR>
              </TBody>
            </TableWrap>
          )}
        </Async>
      </Card>

      <Card title="Trial balance" description={`As of ${formatDate(asOf)}`} padded={false}>
        <Async
          loading={trial.loading}
          error={trial.error}
          data={trial.data}
          onRetry={trial.reload}
          skeleton="table"
        >
          {(data) => (
            <TableWrap>
              <THead>
                <TR>
                  <TH className="w-24">Code</TH>
                  <TH>Account</TH>
                  <TH numeric>Debit</TH>
                  <TH numeric>Credit</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.accountId}>
                    <TD className="font-mono text-xs text-zinc-500">{row.code}</TD>
                    <TD>{row.name}</TD>
                    <TD numeric>{row.debitMinor ? money(row.debitMinor) : ""}</TD>
                    <TD numeric>{row.creditMinor ? money(row.creditMinor) : ""}</TD>
                  </TR>
                ))}
                <TR className="bg-zinc-50 font-semibold">
                  <TD colSpan={2}>Totals</TD>
                  <TD numeric>{money(data.totalDebitMinor)}</TD>
                  <TD numeric>{money(data.totalCreditMinor)}</TD>
                </TR>
              </TBody>
            </TableWrap>
          )}
        </Async>
      </Card>
    </div>
  );
}
