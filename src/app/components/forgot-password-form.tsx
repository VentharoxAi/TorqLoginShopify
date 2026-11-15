"use client";

import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: values.mobileNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to submit your request.");
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit your request.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="message message-success" role="status">
        If this number is registered, your reset request has been received. Our team will verify the account and send a secure WhatsApp reset link shortly.
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="mobileNumber">Mobile Number</label>
        <input
          id="mobileNumber"
          name="mobileNumber"
          type="tel"
          autoComplete="tel"
          required
          placeholder="+923001234567"
        />
        <span className="field-hint">Enter the number registered to your account, including country code.</span>
      </div>
      {error && <div className="message message-error" role="alert">{error}</div>}
      <button className="button" disabled={busy}>{busy ? "Submitting…" : "Request reset link"}</button>
    </form>
  );
}
