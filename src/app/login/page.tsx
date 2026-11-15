import Image from "next/image";
import Link from "next/link";
import { AuthForm } from "@/app/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/login">
          <Image src="/torq-logo.jpg" width={52} height={52} alt="TORQ Bearings logo" unoptimized />
          <span className="brand-name">TORQ BEARINGS<span className="brand-sub">INDUSTRIES</span></span>
        </Link>
        <span className="header-note">Customer account access</span>
      </header>
      <main className="auth-shell">
        <section className="auth-card">
          <aside className="auth-aside">
            <div>
              <Link className="aside-mark-link" href="https://torqbearingsstore.myshopify.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit TORQ Bearings store">
                <Image className="aside-mark" src="/torq-logo.jpg" width={76} height={76} alt="" unoptimized />
              </Link>
              <div className="aside-copy">
                <span className="eyebrow">Precision. Performance. Trust.</span>
                <h2>Your TORQ account</h2>
                <p>Sign in to access your customer account and stay connected with TORQ Bearings.</p>
              </div>
            </div>
            <div className="aside-foot">Built for reliability, backed by TORQ Bearings.</div>
          </aside>
          <div className="auth-main">
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
    </>
  );
}
