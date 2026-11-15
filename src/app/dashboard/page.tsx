import Image from "next/image";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { LogoutButton } from "@/app/components/logout-button";
import { getSession } from "@/lib/auth";
import { getDatabase, type CustomerDocument } from "@/lib/db";

const statusMessage = {
  pending: "Your account is awaiting TORQ Bearings approval.",
  blocked: "Your account access has been blocked. Please contact TORQ Bearings.",
  approved: "Welcome to TORQ Bearings.",
} as const;

export default async function CustomerDashboard() {
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId) redirect("/login");

  const database = await getDatabase();
  const customer = await database
    .collection<CustomerDocument>("customers")
    .findOne(
      { _id: new ObjectId(session.customerId) },
      { projection: { username: 1, status: 1 } },
    );
  if (!customer) redirect("/login");

  return (
    <main className="app-page">
      <header className="topbar">
        <div className="brand">
          <Image src="/torq-logo.jpg" width={52} height={52} alt="TORQ Bearings logo" unoptimized />
          <span className="brand-name">TORQ BEARINGS<span className="brand-sub">INDUSTRIES</span></span>
        </div>
        <div className="topbar-actions"><span className="header-note">Hello, {customer.username}</span><LogoutButton /></div>
      </header>
      <section className="content-wrap">
        <div className="page-heading"><h1>Your account</h1><p>Customer access for TORQ Bearings.</p></div>
        <div className="welcome-panel">
          <div className="stat-label">Account status</div>
          <span className={`status status-${customer.status}`}>{customer.status}</span>
          <h2 style={{ marginTop: 22 }}>{customer.status === "approved" ? `Welcome, ${customer.username}.` : "Account update"}</h2>
          <p>{statusMessage[customer.status]}</p>
        </div>
      </section>
    </main>
  );
}
