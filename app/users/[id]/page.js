import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, userHistory } from "@/lib/queries";
import { inr, inrSigned, fmtDate } from "@/lib/format";
import { Section, Avatar, Empty } from "@/components/Ui";

export async function generateMetadata({ params }) {
  const u = await getUser((await params).id);
  return { title: u ? `${u.name} — SplitEase` : "Person not found" };
}

export default async function UserPage({ params }) {
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();
  const h = await userHistory(id);
  const o = h.overall;

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={user.name} size={52} />
          <div>
            <Link href="/users" className="crumb">← People</Link>
            <h1>{user.name}</h1>
            <p className="small">{user.email}{user.phone && ` · ${user.phone}`}</p>
          </div>
        </div>
        <div className="chips">
          {user.groups.map((g) => <Link key={g._id} href={`/groups/${g._id}`} className="chip" style={{ paddingLeft: 10 }}>{g.name}</Link>)}
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Expenses involved in</div><div className="stat-value">{o.expensesInvolved}</div></div>
        <div className="stat"><div className="stat-label">Expenses paid for</div><div className="stat-value">{o.expensesPaidFor}</div></div>
        <div className="stat"><div className="stat-label">Total paid</div><div className="stat-value">{inr(o.totalPaid)}</div></div>
        <div className="stat"><div className="stat-label">Own share</div><div className="stat-value">{inr(o.totalShare)}</div></div>
      </div>

      <div className="grid grid-2">
        <Section title="Expense history" query={3}>
          {h.history.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Expense</th><th className="num">Paid</th><th className="num">Share</th><th className="num">Effect</th></tr></thead>
                <tbody>
                  {h.history.map((e) => (
                    <tr key={e._id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(e.expenseDate)}</td>
                      <td>{e.description}<span className="sub"><Link href={`/groups/${e.groupId}`}>{e.group}</Link> · paid by {e.paidByName}</span></td>
                      <td className="num">{e.iPaid ? inr(e.iPaid) : <span className="muted">—</span>}</td>
                      <td className="num">{inr(e.myShare)}</td>
                      <td className={`num ${e.netEffect > 0 ? "amount-pos" : e.netEffect < 0 ? "amount-neg" : ""}`}>{inrSigned(e.netEffect)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No expenses yet.</Empty>}
        </Section>

        <div className="stack">
          <Section title="Contribution per group" query={3}>
            {h.perGroup.length ? (
              <table>
                <thead><tr><th>Group</th><th className="num">Paid</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {h.perGroup.map((p) => (
                    <tr key={p.groupId}>
                      <td><Link href={`/groups/${p.groupId}`}>{p.group}</Link><span className="sub">{p.expenses} expenses</span></td>
                      <td className="num">{inr(p.totalPaid)}</td>
                      <td className="num">{inr(p.totalShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Not in any expenses yet.</Empty>}
          </Section>

          <Section title="Payments" query={3}>
            {h.settlements.length ? (
              <table>
                <tbody>
                  {h.settlements.map((s) => (
                    <tr key={s._id}>
                      <td>{s.direction === "paid" ? <>Paid <b>{s.to}</b></> : <>Received from <b>{s.from}</b></>}
                        <span className="sub">{fmtDate(s.settledAt)} · {s.group} · {s.method}</span></td>
                      <td className={`num ${s.direction === "received" ? "amount-pos" : "amount-neg"}`}>
                        {s.direction === "received" ? "+" : "−"}{inr(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No payments yet.</Empty>}
          </Section>
        </div>
      </div>
    </>
  );
}
