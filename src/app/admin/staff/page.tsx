import { redirect } from "next/navigation";
import { AdminHeader } from "@/app/components/admin-header";
import { StaffManagement } from "@/app/components/staff-management";
import { getStaffSession } from "@/lib/staff-auth";

export default async function StaffPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  if (staff.role !== "admin") redirect("/admin");

  return (
    <main className="app-page">
      <AdminHeader staff={staff} />
      <section className="content-wrap">
        <div className="page-heading"><h1>Staff accounts</h1><p>Manage separate portal staff sign-in accounts.</p></div>
        <StaffManagement />
      </section>
    </main>
  );
}
