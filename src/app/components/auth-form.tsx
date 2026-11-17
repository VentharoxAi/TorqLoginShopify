"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Props = {
  mode: "signup" | "login" | "admin";
};

export function AuthForm({ mode }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isSignup = mode === "signup";
  const isLogin = mode === "login";
  const isAdmin = mode === "admin";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const nextFieldErrors: Record<string, string> = {};
    if (isLogin) {
      if (!String(data.mobileNumber ?? "").trim()) nextFieldErrors.mobileNumber = "Enter your mobile number or username.";
      if (!String(data.password ?? "")) nextFieldErrors.password = "Enter your password.";
      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        return;
      }
    }
    if (isSignup) {
      const mobileDigits = String(formData.get("mobileNumber") ?? "").replace(/\D/g, "").replace(/^92/, "").replace(/^0/, "");
      const password = String(formData.get("password") ?? "");
      const confirmPassword = String(formData.get("confirmPassword") ?? "");
      if (!/^3\d{9}$/.test(mobileDigits)) nextFieldErrors.mobileNumber = "Enter a valid mobile number.";
      const username = String(data.username ?? "").trim();
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
        nextFieldErrors.username = "Username must be 3–32 characters using letters, numbers, dots, underscores or hyphens.";
      }
      if (password.length < 12) nextFieldErrors.password = "Password must be at least 12 characters.";
      if (password !== confirmPassword) nextFieldErrors.confirmPassword = "Passwords do not match.";
      if (!formData.has("terms")) nextFieldErrors.terms = "You must agree to the Terms and Conditions.";
      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      data.mobileNumber = `+92${mobileDigits}`;
    }
    setFieldErrors({});
    setBusy(true);
    const endpoint = isSignup
      ? "/api/auth/signup"
      : isAdmin
        ? "/admin/api/login"
        : "/api/auth/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        if (isAdmin && response.status === 401) {
          throw new Error("Username or password is incorrect.");
        }
        if (isLogin && response.status === 401) {
          throw new Error("Mobile number, username or password is incorrect.");
        }
        if ((isLogin || isAdmin) && response.status === 429) {
          throw new Error("Too many attempts. Please try again later.");
        }
        throw new Error(result.error ?? "Unable to complete this request.");
      }
      const customerRedirect = ["/store", "/account/details", "/dashboard"].includes(result.redirectTo)
        ? result.redirectTo
        : "/dashboard";
      window.location.assign(
        isAdmin
          ? "/admin"
          : isSignup
            ? "/login?registered=1"
            : customerRedirect,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to complete this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`form-stack${isSignup ? " signup-form" : isLogin ? " login-form" : ""}`}
      onSubmit={submit}
      noValidate={isSignup || isLogin}
    >
      {(isSignup || isLogin) && error && <div className="message message-error" role="alert">{error}</div>}
      {!isAdmin && !isLogin && (
        <div className="field">
          <label htmlFor="mobileNumber">Mobile Number</label>
          {isSignup ? (
            <div className={`signup-mobile-box${fieldErrors.mobileNumber ? " has-error" : ""}`}>
              <span className="signup-mobile-prefix" aria-hidden="true">+92</span>
              <input
                id="mobileNumber"
                name="mobileNumber"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                required
                placeholder="3XX XXXXXXX"
                aria-invalid={Boolean(fieldErrors.mobileNumber)}
                aria-describedby={fieldErrors.mobileNumber ? "mobileNumber-error" : undefined}
                onChange={() => setFieldErrors((current) => ({ ...current, mobileNumber: "" }))}
              />
            </div>
          ) : (
            <>
              <input id="mobileNumber" name="mobileNumber" type="tel" autoComplete="tel" inputMode="tel" required placeholder="+92 300 1234567" />
              <span className="field-hint">Include your country code, for example +92.</span>
            </>
          )}
          {fieldErrors.mobileNumber && <span className="field-error" id="mobileNumber-error">{fieldErrors.mobileNumber}</span>}
        </div>
      )}
      {isLogin && (
        <div className="field">
          <label htmlFor="loginIdentifier">Mobile number</label>
          <input
            id="loginIdentifier"
            name="mobileNumber"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="03001234567"
            aria-invalid={Boolean(fieldErrors.mobileNumber)}
            aria-describedby={fieldErrors.mobileNumber ? "loginIdentifier-error" : undefined}
            onChange={() => setFieldErrors((current) => ({ ...current, mobileNumber: "" }))}
          />
          {fieldErrors.mobileNumber && <span className="field-error" id="loginIdentifier-error">{fieldErrors.mobileNumber}</span>}
        </div>
      )}
      {isSignup && (
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            minLength={3}
            maxLength={32}
            required
            placeholder="Choose a username"
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
            onChange={() => setFieldErrors((current) => ({ ...current, username: "" }))}
          />
          {fieldErrors.username && <span className="field-error" id="username-error">{fieldErrors.username}</span>}
        </div>
      )}
      {isAdmin && (
        <div className="field">
          <label htmlFor="username">Staff username</label>
          <input id="username" name="username" autoComplete="username" required />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className={isSignup || isLogin ? "signup-password-box" : undefined}>
          <input
            id="password"
            name="password"
            type={(isSignup || isLogin) && showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 12 : undefined}
            required
            placeholder="Enter your password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              isSignup
                ? `${fieldErrors.password ? "password-error " : ""}password-hint`
                : fieldErrors.password
                  ? "password-error"
                  : undefined
            }
            onChange={() => setFieldErrors((current) => ({ ...current, password: "" }))}
          />
          {(isSignup || isLogin) && (
            <button type="button" className="signup-password-toggle" onClick={() => setShowPassword((shown) => !shown)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          )}
        </div>
        {isSignup && <span className="field-hint" id="password-hint">At least 12 characters.</span>}
        {isLogin && (
          <a
            className="login-forgot-link"
            href="https://wa.me/923214073811?text=Hello%20TORQ%20Bearings%2C%20I%20forgot%20my%20password."
            target="_blank"
            rel="noreferrer"
          >
            Forgot password?
          </a>
        )}
        {fieldErrors.password && <span className="field-error" id="password-error">{fieldErrors.password}</span>}
      </div>
      {isSignup && (
        <div className="field">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <div className="signup-password-box">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              placeholder="Re-enter your password"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
              onChange={() => setFieldErrors((current) => ({ ...current, confirmPassword: "" }))}
            />
            <button type="button" className="signup-password-toggle" onClick={() => setShowConfirmPassword((shown) => !shown)}>
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
          {fieldErrors.confirmPassword && <span className="field-error" id="confirmPassword-error">{fieldErrors.confirmPassword}</span>}
        </div>
      )}
      {isSignup && (
        <div className="signup-terms-field">
          <label className="signup-terms-label">
            <input
              type="checkbox"
              name="terms"
              required
              aria-invalid={Boolean(fieldErrors.terms)}
              aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
              onChange={() => setFieldErrors((current) => ({ ...current, terms: "" }))}
            />
            <span>
              I agree to the{" "}
              <a href="/shopify-policy/terms-of-service">
                Terms and Conditions
              </a>
            </span>
          </label>
          {fieldErrors.terms && <span className="field-error" id="terms-error">{fieldErrors.terms}</span>}
        </div>
      )}
      {!isSignup && !isLogin && error && <div className="message message-error" role="alert">{error}</div>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? (
          isSignup
            ? <><span className="signup-spinner" aria-hidden="true" />Creating account</>
            : isLogin
              ? <><span className="signup-spinner" aria-hidden="true" />Signing in</>
              : "Please wait…"
        ) : isSignup ? "Create account" : "Sign in"}
      </button>
      {isAdmin && <div className="admin-foot">Restricted to authorized TORQ Bearings administrators.</div>}
    </form>
  );
}
