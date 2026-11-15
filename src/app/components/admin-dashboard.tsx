"use client";

import { useCallback, useEffect, useState } from "react";

type Customer = {
  id: string;
  username: string;
  mobileNumber: string;
  status: "pending" | "approved" | "blocked";
  createdAt: string;
};

type GeneratedResetLink = {
  username: string;
  mobileNumber: string;
  url: string;
};

export function AdminDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [resetLink, setResetLink] = useState<GeneratedResetLink | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: search, status });
      const response = await fetch(`/api/admin/customers?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load customers.");
      setCustomers(result.customers);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(), 250);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  async function updateStatus(customer: Customer, nextStatus: Customer["status"]) {
    setBusyId(customer.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update account status.");
      await loadCustomers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update account status.");
    } finally {
      setBusyId("");
    }
  }

  async function sendReset(customer: Customer) {
    setBusyId(customer.id);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}/reset-link`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to generate the reset link.");
      setResetLink({
        username: customer.username,
        mobileNumber: result.mobileNumber,
        url: result.resetUrl,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate the reset link.");
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
      <div className="toolbar">
        <input className="search-input toolbar-search" aria-label="Search customers" placeholder="Search username or mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by account status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="blocked">Blocked</option>
        </select>
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
          </div>
          <p>Use a deployed HTTPS APP_URL before sharing. Review the pre-filled message, then press Send in WhatsApp. Generating a new link invalidates the previous one.</p>
        </section>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Mobile Number</th><th>Registration Date</th><th>Account Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="table-empty" colSpan={5}>Loading customers…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td className="table-empty" colSpan={5}>No customers match your search.</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer.id}>
                <td className="username">{customer.username}</td>
                <td>{customer.mobileNumber}</td>
                <td>{new Date(customer.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</td>
                <td><span className={`status status-${customer.status}`}>{customer.status}</span></td>
                <td>
                  <div className="row-actions">
                    {customer.status !== "approved" && <button className="button button-small" disabled={busyId === customer.id} onClick={() => void updateStatus(customer, "approved")}>Approve</button>}
                    {customer.status !== "blocked" && <button className="button button-small button-danger" disabled={busyId === customer.id} onClick={() => void updateStatus(customer, "blocked")}>Block</button>}
                    <button className="button button-small button-secondary" disabled={busyId === customer.id} onClick={() => void sendReset(customer)}>Reset link</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
