import Link from "next/link";
import { listUsers } from "@/lib/queries";
import { Section, Avatar, Empty } from "@/components/Ui";
import { AddUserForm } from "@/components/Forms";

export const metadata = { title: "People — SplitEase" };

export default async function UsersPage() {
  const users = await listUsers();
  return (
    <>
      <div className="page-head">
        <div><h1>People</h1><p>Everyone using the app. Click a person to see their history.</p></div>
      </div>
      <div className="grid grid-2">
        <Section title={`All people (${users.length})`}>
          {users.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th className="num">Groups</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td><Link href={`/users/${u._id}`} className="person"><Avatar name={u.name} size={28} />{u.name}</Link></td>
                      <td className="muted">{u.email}</td>
                      <td className="muted">{u.phone || "—"}</td>
                      <td className="num">{u.groupCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No people yet.</Empty>}
        </Section>
        <Section title="Add a person"><AddUserForm /></Section>
      </div>
    </>
  );
}
