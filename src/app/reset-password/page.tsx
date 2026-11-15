import Image from "next/image";
import Link from "next/link";
import { ResetPasswordForm } from "@/app/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
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
                <span className="eyebrow">Account security</span>
                <h2>Choose a new password</h2>
                <p>Use a strong password that you don’t use for another account.</p>
              </div>
            </div>
          </aside>
          <div className="auth-main">
            <h1>Reset password</h1>
            <p className="auth-intro">Your new password must be at least 10 characters.</p>
            {token ? <ResetPasswordForm token={token} /> : <div className="message message-error">This reset link is missing or invalid. Request a new link.</div>}
            <div className="inline-links"><Link href="/login">Back to sign in</Link></div>
          </div>
        </section>
      </main>
    </>
  );
}
