import Link from "next/link";
import { getStats, listGroups, listUsers, unsettledBalances } from "@/lib/queries";
import { inr, inrSigned } from "@/lib/format";
import { Section, Person, Empty } from "@/components/Ui";
import { CreateGroupForm } from "@/components/Forms";

export default async function Dashboard() {
  const [stats, groups, users, open] = await Promise.all([getStats(), listGroups(), listUsers(), unsettledBalances()]);
  const outstanding = open.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Shared expenses across all groups, and who still owes whom.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Total spent</div><div className="stat-value">{inr(stats.totalSpent)}</div></div>
        <div className="stat"><div className="stat-label">Still to settle</div><div className={`stat-value ${outstanding > 0 ? "neg" : "pos"}`}>{inr(outstanding)}</div></div>
        <div className="stat"><div className="stat-label">Groups</div><div className="stat-value">{stats.groups}</div></div>
        <div className="stat"><div className="stat-label">People</div><div className="stat-value">{stats.users}</div></div>
        <div className="stat"><div className="stat-label">Expenses</div><div className="stat-value">{stats.expenses}</div></div>
        <div className="stat"><div className="stat-label">Payments</div><div className="stat-value">{stats.settlements}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="stack">
          <Section title="Groups" query={1}>
            {groups.length ? (
              <div className="group-cards">
                {groups.map((g) => (
                  <Link key={g._id} href={`/groups/${g._id}`} className="group-card">
                    <h3>{g.name}</h3>
                    <p>{g.description || "No description"}</p>
                    <div className="big">{inr(g.totalSpent)}</div>
                    <div className="row"><span>{g.expenseCount} expenses</span><span>{g.memberCount} members</span></div>
                  </Link>
                ))}
              </div>
            ) : <Empty>No groups yet. Create one on the right.</Empty>}
          </Section>

          <Section title="Unsettled balances" query="4">
            {open.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Group</th><th>Person</th><th>Status</th><th className="num">Balance</th></tr></thead>
                  <tbody>
                    {open.map((b) => (
                      <tr key={b.groupId + b.userId}>
                        <td><Link href={`/groups/${b.groupId}`}>{b.group}</Link></td>
                        <td><Person id={b.userId} name={b.name} size={26} /></td>
                        <td><span className={`pill ${b.net > 0 ? "pos" : "neg"}`}>{b.status}</span></td>
                        <td className={`num ${b.net > 0 ? "amount-pos" : "amount-neg"}`}>{inrSigned(b.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>Everyone is settled up. 🎉</Empty>}
          </Section>
        </div>

        <div className="stack">
          <Section title="Create a group">
            <CreateGroupForm users={users} />
          </Section>
        </div>
      </div>
    </>
  );
}
