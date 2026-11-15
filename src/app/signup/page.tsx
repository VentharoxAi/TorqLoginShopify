import Image from "next/image";
import Link from "next/link";
import { AuthForm } from "@/app/components/auth-form";

export default function SignupPage() {
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
                <h2>Join TORQ Bearings</h2>
                <p>Create your account. Our team will review your registration before approval.</p>
              </div>
            </div>
            <div className="aside-foot">Your information is protected and securely stored.</div>
          </aside>
          <div className="auth-main">
            <h1>Create an account</h1>
            <p className="auth-intro">Enter your details to register with TORQ Bearings.</p>
            <AuthForm mode="signup" />
            <div className="inline-links"><span>Already registered? <Link href="/login">Sign in</Link></span></div>
          </div>
        </section>
      </main>
    </>
  );
}
