import Image from "next/image";
import Link from "next/link";
import { ForgotPasswordForm } from "@/app/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/login">
          <Image src="/torq-logo.jpg" width={52} height={52} alt="TORQ Bearings logo" unoptimized />
          <span className="brand-name">TORQ BEARINGS<span className="brand-sub">INDUSTRIES</span></span>
        </Link>
        <span className="header-note">Secure account recovery</span>
      </header>
      <main className="auth-shell">
        <section className="auth-card">
          <aside className="auth-aside">
            <div>
              <Link className="aside-mark-link" href="https://torqbearingsstore.myshopify.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit TORQ Bearings store">
                <Image className="aside-mark" src="/torq-logo.jpg" width={76} height={76} alt="" unoptimized />
              </Link>
              <div className="aside-copy">
                <span className="eyebrow">Account support</span>
                <h2>Back in control</h2>
                <p>Submit a request and our team will verify your account before sending a private reset link.</p>
              </div>
            </div>
            <div className="aside-foot">Reset links expire after 30 minutes.</div>
          </aside>
          <div className="auth-main">
            <h1>Forgot password?</h1>
            <p className="auth-intro">Enter the mobile number registered to your account. An admin will verify your request and send the secure reset link via WhatsApp.</p>
            <ForgotPasswordForm />
            <div className="inline-links"><Link href="/login">Back to sign in</Link></div>
          </div>
        </section>
      </main>
    </>
  );
}
