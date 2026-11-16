import Link from "next/link";
import { ResetPasswordForm } from "@/app/components/reset-password-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <StoreHeader />
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-main">
            <span className="form-eyebrow">Account security</span>
            <h1>Reset password</h1>
            <p className="auth-intro">Your new password must be at least 10 characters.</p>
            {token ? <ResetPasswordForm token={token} /> : <div className="message message-error">This reset link is missing or invalid. Request a new link.</div>}
            <div className="inline-links"><Link href="/login">Back to sign in</Link></div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
