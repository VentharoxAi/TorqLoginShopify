"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminDashboard } from "@/app/components/admin-dashboard";

type ResetRequest = {
  id: string;
  mobileNumber: string;
  status: "pending" | "sent";
  createdAt: string;
  linkGeneratedAt: string | null;
  sentAt: string | null;
};

type GeneratedResetLink = {
  requestId: string;
  username: string;
  mobileNumber: string;
  url: string;
};

export function AdminWorkspace() {
  const [activeTab, setActiveTab] = useState<"customers" | "requests">("customers");
  const [pendingCount, setPendingCount] = useState(0);

  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="Admin dashboard sections">
        <button
          id="customers-tab"
          className={activeTab === "customers" ? "admin-tab active" : "admin-tab"}
          type="button"
          role="tab"
          aria-selected={activeTab === "customers"}
          aria-controls="customers-panel"
          onClick={() => setActiveTab("customers")}
        >
          Customer accounts
        </button>
        <button
          id="reset-requests-tab"
          className={activeTab === "requests" ? "admin-tab active" : "admin-tab"}
          type="button"
          role="tab"
          aria-selected={activeTab === "requests"}
          aria-controls="reset-requests-panel"
          onClick={() => setActiveTab("requests")}
        >
          Password reset requests
          {pendingCount > 0 && <span className="notification-badge">{pendingCount}</span>}
        </button>
      </div>
      <div
        id="customers-panel"
        className="admin-tab-panel"
        role="tabpanel"
        aria-labelledby="customers-tab"
        hidden={activeTab !== "customers"}
      >
        <AdminDashboard />
      </div>
      <div
        id="reset-requests-panel"
        className="admin-tab-panel"
        role="tabpanel"
        aria-labelledby="reset-requests-tab"
        hidden={activeTab !== "requests"}
      >
        <PasswordResetRequests onPendingCountChange={setPendingCount} />
      </div>
    </>
  );
}

function PasswordResetRequests({
  onPendingCountChange,
}: {
  onPendingCountChange: (count: number) => void;
}) {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [resetLink, setResetLink] = useState<GeneratedResetLink | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRequests = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/password-reset-requests", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load reset requests.");
      setRequests(result.requests);
      onPendingCountChange(result.pendingCount);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load reset requests.");
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    void loadRequests();
    const timer = window.setInterval(() => void loadRequests(), 30000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  async function generateLink(resetRequest: ResetRequest) {
    setBusyId(resetRequest.id);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(
        `/api/admin/password-reset-requests/${resetRequest.id}/reset-link`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to generate the reset link.");
      setResetLink({
        requestId: resetRequest.id,
        username: result.username,
        mobileNumber: result.mobileNumber,
        url: result.resetUrl,
      });
      await loadRequests();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate the reset link.");
    } finally {
      setBusyId("");
    }
  }

  async function markAsSent(requestId: string) {
    setBusyId(requestId);
    setError("");
    try {
      const response = await fetch(`/api/admin/password-reset-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update the request.");
      setResetLink(null);
      await loadRequests();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the request.");
    } finally {
      setBusyId("");
    }
  }

  async function copyResetLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.url);
      setCopied(true);
    } catch {
      setError("Could not copy the reset link. Select and copy it manually.");
    }
  }

  const whatsappUrl = resetLink
    ? `https://wa.me/${resetLink.mobileNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
        `TORQ Bearings password reset link (expires in 30 minutes): ${resetLink.url}`,
      )}`
    : "";

  return (
    <>
      <div className="requests-toolbar">
        <p>Requests refresh automatically every 30 seconds. Send links only after verifying the customer.</p>
        <button className="button button-secondary button-small" type="button" onClick={() => void loadRequests()}>Refresh</button>
      </div>
      {error && <div className="message message-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      {resetLink && (
        <section className="reset-panel" aria-label="Generated password reset link">
          <div className="reset-panel-heading">
            <div>
              <strong>Reset link ready for {resetLink.username}</strong>
              <span>{resetLink.mobileNumber} · expires in 30 minutes · single-use</span>
            </div>
            <button className="reset-close" type="button" aria-label="Close reset link" onClick={() => setResetLink(null)}>×</button>
          </div>
          <input className="search-input reset-url" aria-label="Password reset link" readOnly value={resetLink.url} onFocus={(event) => event.currentTarget.select()} />
          <div className="reset-actions">
            <button className="button button-secondary" type="button" onClick={() => void copyResetLink()}>{copied ? "Copied" : "Copy link"}</button>
            <a className="button" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
            <button className="button button-secondary" type="button" disabled={busyId === resetLink.requestId} onClick={() => void markAsSent(resetLink.requestId)}>
              {busyId === resetLink.requestId ? "Updating…" : "Mark as sent"}
            </button>
          </div>
          <p>Review the pre-filled message and press Send in WhatsApp before marking the request as sent.</p>
        </section>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Mobile Number</th><th>Requested</th><th>Link status</th><th>Request status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="table-empty" colSpan={5}>Loading reset requests…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td className="table-empty" colSpan={5}>There are no password reset requests.</td></tr>
            ) : requests.map((resetRequest) => (
              <tr key={resetRequest.id}>
                <td>{resetRequest.mobileNumber}</td>
                <td>{new Date(resetRequest.createdAt).toLocaleString()}</td>
                <td>{resetRequest.linkGeneratedAt ? new Date(resetRequest.linkGeneratedAt).toLocaleString() : "Not generated"}</td>
                <td><span className={`status status-${resetRequest.status}`}>{resetRequest.status}</span></td>
                <td>
                  {resetRequest.status === "pending" && (
                    <button
                      className="button button-small button-secondary"
                      type="button"
                      disabled={busyId === resetRequest.id}
                      onClick={() => void generateLink(resetRequest)}
                    >
                      {busyId === resetRequest.id ? "Generating…" : resetRequest.linkGeneratedAt ? "Regenerate link" : "Generate link"}
                    </button>
                  )}
                  {resetRequest.status === "sent" && resetRequest.sentAt && <span>{new Date(resetRequest.sentAt).toLocaleString()}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
