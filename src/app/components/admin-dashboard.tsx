"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type AccountStatus = "pending" | "approved" | "blocked";
type CustomerRow = {
  id: string;
  shopName: string;
  contactPersonName: string;
  city: string;
  mobileNumber: string;
  status: AccountStatus;
  submittedAt: string | null;
};
type CustomerListResult = {
  counts: Record<AccountStatus, number>;
  page: number;
  totalPages: number;
  customers: CustomerRow[];
};

const statuses: AccountStatus[] = ["pending", "approved", "blocked"];

export function AdminDashboard() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [counts, setCounts] = useState<Record<AccountStatus, number>>({
    pending: 0,
    approved: 0,
    blocked: 0,
  });
  const [status, setStatus] = useState<AccountStatus>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, q: search, page: String(page) });
      const response = await fetch(`/admin/api/customers?${params}`, { cache: "no-store" });
      const result = await response.json() as CustomerListResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load customers.");
      setCustomers(result.customers);
      setCounts(result.counts);
      setTotalPages(result.totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(), 200);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  function chooseStatus(nextStatus: AccountStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="Customer verification status">
        {statuses.map((item) => (
          <button
            key={item}
            id={`${item}-tab`}
            className={status === item ? "admin-tab active" : "admin-tab"}
            type="button"
            role="tab"
            aria-selected={status === item}
            onClick={() => chooseStatus(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
            <span className="notification-badge">{counts[item]}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          className="search-input toolbar-search"
          aria-label="Search customers"
          placeholder="Search shop, contact, mobile or city"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && <div className="message message-error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Shop name</th>
              <th>Contact person</th>
              <th>City</th>
              <th>Mobile</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="table-empty" colSpan={6}>Loading customers…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td className="table-empty" colSpan={6}>No customers in this status.</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer.id}>
                <td><Link className="admin-customer-link" href={`/admin/customers/${customer.id}`}>{customer.shopName || "Details not submitted"}</Link></td>
                <td>{customer.contactPersonName || "—"}</td>
                <td>{customer.city || "—"}</td>
                <td><a href={`tel:${customer.mobileNumber}`}>{customer.mobileNumber}</a></td>
                <td><span className={`status status-${customer.status}`}>{customer.status}</span></td>
                <td>{customer.submittedAt ? new Date(customer.submittedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not submitted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination" aria-label="Customer pages">
        <span>{counts[status]} customers · page {page} of {totalPages}</span>
        <div>
          <button className="button button-secondary button-small" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <button className="button button-secondary button-small" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}
