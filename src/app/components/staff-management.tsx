"use client";

import { useCallback, useEffect, useState } from "react";

type StaffUser = {
  id: string;
  username: string;
  role: "admin" | "staff";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function StaffManagement() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch("/admin/api/staff", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load staff users.");
      setUsers(result.users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load staff users.");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("new");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/admin/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create staff account.");
      setUsername("");
      setPassword("");
      setMessage(result.message);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create staff account.");
    } finally {
      setBusy("");
    }
  }

  async function setActive(user: StaffUser, active: boolean) {
    setBusy(user.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/admin/api/staff/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update staff account.");
      setMessage(result.message);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update staff account.");
    } finally {
      setBusy("");
    }
  }

  async function resetPassword(user: StaffUser) {
    setBusy(user.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/admin/api/staff/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswords[user.id] ?? "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to reset staff password.");
      setResetPasswords((current) => ({ ...current, [user.id]: "" }));
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset staff password.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {error && <div className="message message-error" role="alert">{error}</div>}
      {message && <div className="message message-success" role="status">{message}</div>}
      <section className="dashboard-card staff-add-card">
        <h2>Add staff account</h2>
        <form className="staff-add-form" onSubmit={(event) => void addStaff(event)}>
          <label className="field">
            <span>Username</span>
            <input autoComplete="off" minLength={3} maxLength={64} required value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="field">
            <span>Temporary password (14+ characters)</span>
            <input type="password" autoComplete="new-password" minLength={14} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "staff")}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="button" type="submit" disabled={busy === "new"}>{busy === "new" ? "Adding…" : "Add staff"}</button>
        </form>
      </section>
      <section className="dashboard-card">
        <h2>Staff accounts</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Reset password</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td><span className={`status status-${user.active ? "approved" : "blocked"}`}>{user.active ? "active" : "inactive"}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <input
                      className="search-input staff-reset-input"
                      type="password"
                      autoComplete="new-password"
                      minLength={14}
                      placeholder="New password"
                      value={resetPasswords[user.id] ?? ""}
                      onChange={(event) => setResetPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                    />
                    <button className="button button-small button-secondary" type="button" disabled={busy === user.id} onClick={() => void resetPassword(user)}>Reset</button>
                  </td>
                  <td>
                    <button className="button button-small button-secondary" type="button" disabled={busy === user.id} onClick={() => void setActive(user, !user.active)}>
                      {user.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td className="table-empty" colSpan={6}>No staff accounts found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
