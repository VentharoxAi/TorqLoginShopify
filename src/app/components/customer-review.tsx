"use client";

import { useCallback, useEffect, useState } from "react";

type AccountStatus = "pending" | "approved" | "blocked";
type ShopifySyncState = "synced" | "pending" | "failed";
type ShopifySyncResult = { state: ShopifySyncState; lastError: string };
type CustomerData = {
  id: string;
  username: string;
  accountMobileNumber: string;
  status: AccountStatus;
  details: {
    contactPersonName: string;
    shopName: string;
    contactMobileNumber: string;
    alternateMobileNumber: string;
    shopAddress: string;
    detailedAddress: string;
    city: string;
    province: string;
    comments: string;
    submittedAt: string | null;
  };
  shopifySync: {
    state: ShopifySyncState;
    lastError: string;
    attempts: number;
    syncedAt: string | null;
  };
};
type HistoryItem = {
  id: string;
  actor: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
  note: string;
  createdAt: string;
  eventType: "status-change" | "reconciled";
};

function syncLabel(state: ShopifySyncState): string {
  if (state === "synced") return "Synced";
  if (state === "failed") return "Sync Failed";
  return "Pending Sync";
}

export function CustomerReview({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/admin/api/customers/${customerId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load customer.");
      setCustomer(result.customer);
      setHistory(result.history);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customer.");
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: AccountStatus) {
    if (!customer) return;
    if (status === "blocked" && !window.confirm("Block this customer? This will stop store access.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/admin/api/customers/${customer.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update customer status.");
      const sync = result.shopifySync as ShopifySyncResult | undefined;
      setMessage(
        sync
          ? `Portal status saved. Shopify sync: ${syncLabel(sync.state)}.`
          : "Portal status saved. Shopify sync: Pending Sync.",
      );
      setNote("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update customer status.");
    } finally {
      setBusy(false);
    }
  }

  async function retrySync() {
    if (!customer) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/admin/api/customers/${customer.id}/retry-sync`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to queue Shopify sync.");
      const sync = result.shopifySync as ShopifySyncResult | undefined;
      setMessage(`Shopify sync: ${syncLabel(sync?.state ?? "pending")}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to queue Shopify sync.");
    } finally {
      setBusy(false);
    }
  }

  if (!customer) {
    return error
      ? <div className="message message-error" role="alert">{error}</div>
      : <p>Loading customer details…</p>;
  }

  const detail = customer.details;
  const phone = detail.contactMobileNumber || customer.accountMobileNumber;
  const whatsappNumber = phone.replace(/\D/g, "");
  return (
    <div className="customer-review">
      {error && <div className="message message-error" role="alert">{error}</div>}
      {message && <div className="message message-success" role="status">{message}</div>}
      <section className="dashboard-card customer-review-card">
        <div className="customer-review-heading">
          <div>
            <h2>{detail.shopName || customer.username}</h2>
            <p>{detail.contactPersonName || "Contact person not submitted"} · {detail.city || "City not submitted"}</p>
          </div>
          <span className={`status status-${customer.status}`}>{customer.status}</span>
        </div>
        <dl className="customer-details-grid">
          <div><dt>Contact person</dt><dd>{detail.contactPersonName || "—"}</dd></div>
          <div><dt>Shop name</dt><dd>{detail.shopName || "—"}</dd></div>
          <div><dt>Mobile / WhatsApp</dt><dd>{phone || "—"}</dd></div>
          <div><dt>Alternate mobile</dt><dd>{detail.alternateMobileNumber || "—"}</dd></div>
          <div><dt>Shop address</dt><dd>{detail.shopAddress || "—"}</dd></div>
          <div><dt>Detailed address</dt><dd>{detail.detailedAddress || "—"}</dd></div>
          <div><dt>City / province</dt><dd>{detail.city || "—"}, {detail.province || "—"}</dd></div>
          <div><dt>Comments</dt><dd>{detail.comments || "—"}</dd></div>
          <div><dt>Submitted</dt><dd>{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "Not submitted"}</dd></div>
        </dl>
        <div className="customer-contact-actions">
          {phone && <a className="button button-secondary" href={`tel:${phone}`}>Call</a>}
          {whatsappNumber && <a className="button button-secondary" href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        </div>
      </section>

      <section className="dashboard-card customer-review-card">
        <h2>Verification</h2>
        <label className="field">
          <span>Note (required to block; optional otherwise)</span>
          <textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="customer-status-actions">
          <button className="button button-approve" type="button" disabled={busy || customer.status === "approved"} onClick={() => void changeStatus("approved")}>Approve</button>
          <button className="button button-outline" type="button" disabled={busy || customer.status === "pending"} onClick={() => void changeStatus("pending")}>Set to pending</button>
          <button className="button button-block" type="button" disabled={busy || customer.status === "blocked"} onClick={() => void changeStatus("blocked")}>Block</button>
        </div>
      </section>

      <section className="dashboard-card customer-review-card">
        <div className="sync-state-heading">
          <h2>Shopify sync</h2>
          <span className={`status status-${customer.shopifySync.state === "failed" ? "blocked" : customer.shopifySync.state === "synced" ? "approved" : "pending"}`}>{syncLabel(customer.shopifySync.state)}</span>
        </div>
        {customer.shopifySync.lastError && <p className="message message-error">{customer.shopifySync.lastError}</p>}
        {customer.shopifySync.syncedAt && <p>Last synced {new Date(customer.shopifySync.syncedAt).toLocaleString()}.</p>}
        {customer.shopifySync.attempts > 0 && <p>Attempts: {customer.shopifySync.attempts}</p>}
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void retrySync()}>Retry sync</button>
      </section>

      <section className="dashboard-card customer-review-card">
        <h2>Status history</h2>
        {history.length === 0 ? <p>No status changes recorded.</p> : (
          <ol className="status-history">
            {history.map((event) => (
              <li key={event.id}>
                <strong>{event.actor}</strong>
                <span>{event.oldStatus} → {event.newStatus}</span>
                <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
