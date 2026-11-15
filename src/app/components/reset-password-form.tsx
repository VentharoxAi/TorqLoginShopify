"use client";

import { FormEvent, useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password, confirmPassword: values.confirmPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to reset your password.");
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset your password.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) return <div className="message message-success">Your password has been updated. You can now sign in.</div>;
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="password">New Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required placeholder="At least 10 characters" />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm New Password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required placeholder="Re-enter your new password" />
      </div>
      {error && <div className="message message-error" role="alert">{error}</div>}
      <button className="button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
    </form>
  );
}
