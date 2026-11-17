import Link from "next/link";
import { AuthBackLink } from "@/app/components/auth-back-link";
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
      <main className="signup-page">
        <div className="auth-card-container">
          <AuthBackLink />
          <section className="signup-card">
            <header className="signup-card-header">
              <h1>Sign in to TORQ</h1>
              <p>Use your mobile number to continue.</p>
            </header>
            {params.registered === "1" && (
              <div className="message message-success login-success-message">
                Account created. Your account is pending approval.
              </div>
            )}
            <AuthForm mode="login" />
            <p className="signup-login-prompt">
              New customer? <Link href="/signup">Create account</Link>
            </p>
          </section>
        </div>
      </main>
      <StoreFooter />
    </>
  );
}
