import Link from "next/link";
import { AuthForm } from "@/app/components/auth-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <StoreHeader />
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-main">
            <span className="form-eyebrow">Customer account</span>
            <h1>Welcome back</h1>
            <p className="auth-intro">Sign in with your registered mobile number.</p>
            {params.registered === "1" && <div className="message message-success" style={{ marginBottom: 16 }}>Account created. Your account is pending approval.</div>}
            <AuthForm mode="login" />
            <div className="inline-links">
              <Link href="/forgot-password">Forgot password?</Link>
              <span>New here? <Link href="/signup">Create account</Link></span>
            </div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
