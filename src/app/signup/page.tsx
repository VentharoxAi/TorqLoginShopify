import Link from "next/link";
import { AuthForm } from "@/app/components/auth-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";

export default function SignupPage() {
  return (
    <>
      <StoreHeader />
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-main">
            <span className="form-eyebrow">Customer account</span>
            <h1>Create your TORQ account</h1>
            <p className="auth-intro">Sign up with your mobile number to create a TORQ customer account.</p>
            <AuthForm mode="signup" />
            <div className="inline-links"><span>Already registered? <Link href="/login">Sign in</Link></span></div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
