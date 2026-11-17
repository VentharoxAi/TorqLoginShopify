import Link from "next/link";
import { ContactForm } from "@/app/components/contact-form";
import { StoreHeader } from "@/app/components/store-chrome";

export const metadata = {
  title: "Contact TORQ Bearings",
};

export default function ContactPage() {
  return (
    <>
      <StoreHeader />
      <main className="contact-page">
        <section className="contact-content">
          <h1>Contact</h1>
          <ContactForm />
        </section>

        <footer className="contact-footer">
          <div className="contact-footer-main">
            <section className="contact-footer-brand">
              <div className="contact-footer-brand-title">
                <span aria-hidden="true">T</span>
                <strong>Torque Bearings</strong>
              </div>
              <p>Bearings and industrial spare parts for your business.</p>
              <small>Operated by Aysha Bearing Industries.</small>
            </section>

            <section className="contact-footer-details">
              <h2>Get in touch</h2>
              <p>Phone: <a href="tel:+923224824413">+92 322 4824413</a></p>
              <p>Email: <a href="mailto:Ahmad.Ajam18@hotmail.com">Ahmad.Ajam18@hotmail.com</a></p>
              <p>Address: 33-B, Street 1, Phase 5, DHA, Lahore, Pakistan.</p>
            </section>

            <nav className="contact-footer-links" aria-label="Helpful links">
              <h2>Helpful links</h2>
              <div>
                <Link href="/contact">Contact us</Link>
                <Link href="/shopify-policy/privacy-policy">Privacy Policy</Link>
                <Link href="/shopify-policy/shipping-policy">Shipping Policy</Link>
                <Link href="/shopify-policy/refund-policy">Refund Policy</Link>
                <Link href="/shopify-policy/terms-of-service">Terms &amp; Conditions</Link>
              </div>
            </nav>
          </div>
          <div className="contact-footer-bottom">
            <span>© {new Date().getFullYear()} torqbearingsStore</span>
            <Link href="/dashboard">Customer account</Link>
          </div>
        </footer>
      </main>
    </>
  );
}
