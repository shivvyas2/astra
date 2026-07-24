import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminListUsers } from "@/lib/admin/data";

export default async function AdminHome() {
  await requireAdmin();
  const users = await adminListUsers();
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Users</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr><th className="py-2">Name</th><th>Joined</th><th>Chats</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-white/10">
              <td className="py-2">{u.displayName}</td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>{u.conversationCount}</td>
              <td><Link className="text-accent" href={`/admin/users/${u.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
