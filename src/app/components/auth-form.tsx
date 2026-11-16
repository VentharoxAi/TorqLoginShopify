"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Props = {
  mode: "signup" | "login" | "admin";
};

export function AuthForm({ mode }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";
  const isAdmin = mode === "admin";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = isSignup
      ? "/api/auth/signup"
      : isAdmin
        ? "/api/admin/login"
        : "/api/auth/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete this request.");
      window.location.assign(isAdmin ? "/admin" : isSignup ? "/login?registered=1" : "/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to complete this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      {!isAdmin && (
        <div className="field">
          <label htmlFor="mobileNumber">Mobile Number</label>
          <input id="mobileNumber" name="mobileNumber" type="tel" autoComplete="tel" inputMode="tel" required placeholder="+92 300 1234567" />
          <span className="field-hint">Include your country code, for example +92.</span>
        </div>
      )}
      {isSignup && (
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" minLength={3} maxLength={32} required placeholder="Choose a username" />
          <span className="field-hint">3–32 letters, numbers, dots, underscores or hyphens.</span>
        </div>
      )}
      {isAdmin && (
        <div className="field">
          <label htmlFor="username">Admin username</label>
          <input id="username" name="username" autoComplete="username" required />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={isSignup ? 10 : undefined} required placeholder={isSignup ? "At least 10 characters" : "Enter your password"} />
      </div>
      {isSignup && (
        <div className="field">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required placeholder="Re-enter your password" />
        </div>
      )}
      {error && <div className="message message-error" role="alert">{error}</div>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
      </button>
      {isAdmin && <div className="admin-foot">Restricted to authorized TORQ Bearings administrators.</div>}
    </form>
  );
}
