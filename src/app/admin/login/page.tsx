import Link from "next/link";
import { AuthForm } from "@/app/components/auth-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.role === "admin") redirect("/admin");
  return (
    <>
      <StoreHeader />
      <main className="auth-shell">
        <section className="auth-card admin-login">
          <div className="auth-main">
            <span className="eyebrow" style={{ color: "var(--blue)" }}>Restricted area</span>
            <h1 style={{ marginTop: 10 }}>Admin sign in</h1>
            <p className="auth-intro">Sign in with your authorized administrator credentials.</p>
            <AuthForm mode="admin" />
            <div className="inline-links"><Link href="/login">Customer sign in</Link></div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
