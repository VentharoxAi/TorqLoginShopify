import Image from "next/image";
import { redirect } from "next/navigation";
import { AdminWorkspace } from "@/app/components/admin-workspace";
import { LogoutButton } from "@/app/components/logout-button";
import { getSession } from "@/lib/auth";

export default async function AdminPage() {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/admin/login");
  return (
    <main className="app-page">
      <header className="topbar">
        <div className="brand">
          <Image src="/torq-logo.jpg" width={52} height={52} alt="TORQ Bearings logo" unoptimized />
          <span className="brand-name">TORQ BEARINGS<span className="brand-sub">INDUSTRIES</span></span>
        </div>
        <div className="topbar-actions"><span className="header-note">Admin dashboard</span><LogoutButton /></div>
      </header>
      <section className="content-wrap">
        <div className="page-heading"><h1>Account management</h1><p>Manage customer accounts and review password reset requests.</p></div>
        <div className="dashboard-card"><AdminWorkspace /></div>
      </section>
    </main>
  );
}
