import { redirect } from "next/navigation";
import { AdminWorkspace } from "@/app/components/admin-workspace";
import { AdminHeader } from "@/app/components/admin-header";
import { getStaffSession } from "@/lib/staff-auth";

export default async function AdminPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  return (
    <main className="app-page">
      <AdminHeader staff={staff} />
      <section className="content-wrap">
        <div className="page-heading"><h1>Customer verification</h1><p>Review shop details and manage local account status.</p></div>
        <div className="dashboard-card"><AdminWorkspace /></div>
      </section>
    </main>
  );
}
