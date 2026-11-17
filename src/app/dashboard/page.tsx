import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";
import { getSession } from "@/lib/auth";
import { getDatabase, type CustomerDocument, type ShopifySyncJobDocument } from "@/lib/db";

const statusMessage = {
  pending: "Your account is under review. Store access is not available yet.",
  blocked: "Your account is on hold. Please contact TORQ Bearings for help.",
  approved: "Welcome to TORQ Bearings.",
} as const;

export default async function CustomerDashboard() {
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId) redirect("/signup");

  const database = await getDatabase();
  const customer = await database
    .collection<CustomerDocument>("customers")
    .findOne(
      { _id: new ObjectId(session.customerId) },
    { projection: { username: 1, shop_details: 1 } },
    );
  if (!customer) redirect("/signup");
  const status = customer.shop_details.status;
  if (!customer.shop_details.completedAt) redirect("/account/details");
  const syncJob = await database
    .collection<ShopifySyncJobDocument>("shopify_sync_jobs")
    .findOne({ _id: customer._id });
  const syncStatus = syncJob?.status === "synced"
    ? "synced"
    : syncJob?.status === "failed"
      ? "failed"
      : "pending";
  const syncLabel = syncStatus === "synced"
    ? "Synced"
    : syncStatus === "failed"
      ? "Sync Failed"
      : "Pending Sync";

  return (
    <>
      <StoreHeader customer={{
        status,
        name: customer.shop_details.contactPersonName?.trim() || customer.username,
      }} />
      <main className="app-page">
        <section className="content-wrap">
          <div className="page-heading"><h1>Your account</h1><p>Customer access for TORQ Bearings.</p></div>
          <div className="welcome-panel">
            <div className="stat-label">Account status</div>
            <span className={`status status-${status}`}>{status === "pending" ? "under review" : status}</span>
            <h2 style={{ marginTop: 22 }}>{status === "approved" ? `Welcome, ${customer.username}.` : "Account update"}</h2>
            <p>{statusMessage[status]}</p>
            <p role="status">
              Shopify sync: <span className={`status status-${syncStatus === "synced" ? "approved" : syncStatus === "failed" ? "blocked" : "pending"}`}>{syncLabel}</span>
            </p>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
