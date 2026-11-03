import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroup, groupExpenseReport, getGroupBalances, suggestSettlements, groupSettlements, listUsers } from "@/lib/queries";
import { inr, inrSigned, fmtDate } from "@/lib/format";
import { Section, Person, Avatar, Empty } from "@/components/Ui";
import { AddExpenseForm, AddMemberForm, DeleteExpenseButton, RecordPaymentForm, SettleButton } from "@/components/Forms";
import { deleteExpense } from "@/app/actions";

export async function generateMetadata({ params }) {
  const g = await getGroup((await params).id);
  return { title: g ? `${g.name} — SplitEase` : "Group not found" };
}

export default async function GroupPage({ params }) {
  const { id } = await params;
  const group = await getGroup(id);
  if (!group) notFound();

  const [report, balances, payments, users] = await Promise.all([
    groupExpenseReport(id), getGroupBalances(id), groupSettlements(id), listUsers(),
  ]);
  const plan = suggestSettlements(balances);
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.net)));
  const maxCat = Math.max(1, ...report.byCategory.map((c) => c.spent));
  const nonMembers = users.filter((u) => !group.members.some((m) => m.userId === u._id));
  const debtors = balances.filter((b) => b.net < -0.009);
  const creditors = balances.filter((b) => b.net > 0.009);
  const sum = Math.round(balances.reduce((s, b) => s + b.net, 0) * 100) / 100;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="crumb">← Dashboard</Link>
          <h1>{group.name}</h1>
          {group.description && <p>{group.description}</p>}
        </div>
        <div className="chips">
          {group.members.map((m) => (
            <Link key={m.userId} href={`/users/${m.userId}`} className="chip">
              <Avatar name={m.name} size={24} />{m.name}{m.role === "admin" && <span className="muted small">admin</span>}
            </Link>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Total spending</div><div className="stat-value">{inr(report.total.totalSpending)}</div></div>
        <div className="stat"><div className="stat-label">Expenses</div><div className="stat-value">{report.total.expenseCount}</div></div>
        <div className="stat"><div className="stat-label">Average expense</div><div className="stat-value">{inr(report.total.avgExpense)}</div></div>
        <div className="stat"><div className="stat-label">Still to settle</div>
          <div className={`stat-value ${creditors.length ? "neg" : "pos"}`}>{inr(creditors.reduce((s, b) => s + b.net, 0))}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="stack">
          <Section title="Expenses" query={1}>
            {report.expenses.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th>Split</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {report.expenses.map((e) => (
                      <tr key={e._id}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(e.expenseDate)}</td>
                        <td>{e.description}<span className="sub"><span className="pill cat">{e.category}</span></span></td>
                        <td>{e.paidByName}</td>
                        <td style={{ whiteSpace: "nowrap" }} title={e.participants.map((p) => `${p.name}: ${inr(p.share)}`).join("\n")}>
                          {e.splitType === "EQUAL" ? "Equal" : "Custom"}<span className="sub">{e.splitAmong} people</span></td>
                        <td className="num">{inr(e.amount)}</td>
                        <td>
                          <DeleteExpenseButton action={deleteExpense} expenseId={e._id} label={e.description} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={4}>Total</td><td className="num">{inr(report.total.totalSpending)}</td><td></td></tr></tfoot>
                </table>
              </div>
            ) : <Empty>No expenses yet. Add the first one below.</Empty>}
          </Section>

          {report.byCategory.length > 0 && (
            <Section title="Spending by category" query={1}>
              <div className="cats">
                {report.byCategory.map((c) => (
                  <div className="cat-row" key={c.category}>
                    <span>{c.category}</span>
                    <div className="cat-track"><div className="cat-fill" style={{ width: `${(c.spent / maxCat) * 100}%` }} /></div>
                    <span className="num">{inr(c.spent)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Add an expense">
            <AddExpenseForm groupId={group._id} members={group.members} />
          </Section>
        </div>

        <div className="stack">
          <Section title="Balances" query={2}>
            {balances.map((b) => {
              const w = (Math.abs(b.net) / maxAbs) * 50;
              return (
                <div className="bal-row" key={b.userId}>
                  <Person id={b.userId} name={b.name} size={28} />
                  <span className={`num ${b.net > 0.009 ? "amount-pos" : b.net < -0.009 ? "amount-neg" : "muted"}`}>
                    {b.net > 0.009 ? "gets back " : b.net < -0.009 ? "owes " : ""}{b.status === "settled up" ? "settled up" : inr(Math.abs(b.net))}</span>
                  <div className="bal-bar" aria-hidden="true">
                    <span style={b.net >= 0
                      ? { left: "50%", width: `${w}%`, background: "var(--pos)" }
                      : { right: "50%", width: `${w}%`, background: "var(--neg)" }} />
                  </div>
                  <div className="bal-meta">Paid {inr(b.totalPaid)} · share {inr(b.totalShare)}
                    {(b.settledOut > 0 || b.settledIn > 0) && <> · repaid {inr(b.settledOut)} · received {inr(b.settledIn)}</>}</div>
                </div>
              );
            })}
            <div className="bal-meta" style={{ padding: "8px 18px 12px" }}>Check: all balances add up to {inr(sum)}</div>
          </Section>

          <Section title="Settle up" query={4}>
            {plan.length ? plan.map((p) => (
              <div className="settle" key={p.fromId + p.toId}>
                <span className="settle-text"><b>{p.from}</b><span className="arrow">pays</span><b>{p.to}</b>
                  <span className="sub">{inr(p.amount)}</span></span>
                <SettleButton groupId={group._id} fromId={p.fromId} toId={p.toId} amount={p.amount} />
              </div>
            )) : <Empty>Everyone in this group is settled up. 🎉</Empty>}
          </Section>

          {plan.length > 0 && (
            <Section title="Record a payment" query={4}>
              <RecordPaymentForm groupId={group._id} members={group.members} debtors={debtors} creditors={creditors} />
            </Section>
          )}

          <Section title="Payment history" query={4}>
            {payments.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Date</th><th>Payment</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {payments.map((s) => (
                      <tr key={s._id}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(s.settledAt)}</td>
                        <td>{s.from} → {s.to}<span className="sub">{s.method}{s.note ? ` · ${s.note}` : ""}</span></td>
                        <td className="num">{inr(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No payments recorded yet.</Empty>}
          </Section>

          <Section title="Add a member">
            <AddMemberForm groupId={group._id} people={nonMembers} />
          </Section>
        </div>
      </div>
    </>
  );
}
