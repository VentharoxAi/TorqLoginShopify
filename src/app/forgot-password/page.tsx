import Link from "next/link";
import { ForgotPasswordForm } from "@/app/components/forgot-password-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";

export default function ForgotPasswordPage() {
  return (
    <>
      <StoreHeader />
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-main">
            <span className="form-eyebrow">Account support</span>
            <h1>Forgot password?</h1>
            <p className="auth-intro">Enter the mobile number registered to your account. An admin will verify your request and send the secure reset link via WhatsApp.</p>
            <ForgotPasswordForm />
            <div className="inline-links"><Link href="/login">Back to sign in</Link></div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
