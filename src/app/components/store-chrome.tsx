import Image from "next/image";
import Link from "next/link";

const storeUrl = "https://torqbearingsstore.myshopify.com";

export function StoreHeader() {
  return (
    <header className="site-header">
      <Link className="store-brand" href={storeUrl} target="_blank" rel="noopener noreferrer">
        <Image src="/torq-logo.jpg" width={30} height={30} alt="" unoptimized />
        torqbearingsStore
      </Link>
      <nav className="store-nav" aria-label="Store navigation">
        <Link href={storeUrl} target="_blank" rel="noopener noreferrer">Home</Link>
        <Link href={`${storeUrl}/pages/contact`} target="_blank" rel="noopener noreferrer">Contact</Link>
      </nav>
      <div className="store-actions">
        <Link className="store-icon-link" href="/login" aria-label="Customer account">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.5 20c.6-3.5 2.8-5.3 6.5-5.3s5.9 1.8 6.5 5.3" />
          </svg>
        </Link>
        <Link className="store-icon-link" href={`${storeUrl}/cart`} target="_blank" rel="noopener noreferrer" aria-label="Shopping cart">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5.5 7.5h13l-.8 13h-11z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <section className="footer-brand">
          <div className="footer-brand-heading">
            <span className="footer-mark" aria-hidden="true">T</span>
            <strong>Torque Bearings</strong>
          </div>
          <p>Bearings and industrial spare parts for your business.</p>
          <small>Operated by Aysha Bearing Industries.</small>
        </section>
        <section className="footer-contact">
          <h2>Get in touch</h2>
          <Link href={`${storeUrl}/pages/contact`} target="_blank" rel="noopener noreferrer">Contact TORQ Bearings</Link>
        </section>
        <section className="footer-links">
          <h2>Helpful links</h2>
          <div>
            <Link href={`${storeUrl}/pages/contact`} target="_blank" rel="noopener noreferrer">Contact us</Link>
            <Link href={`${storeUrl}/policies/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
            <Link href={`${storeUrl}/policies/shipping-policy`} target="_blank" rel="noopener noreferrer">Shipping Policy</Link>
            <Link href={`${storeUrl}/policies/refund-policy`} target="_blank" rel="noopener noreferrer">Refund Policy</Link>
            <Link href={`${storeUrl}/policies/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link>
          </div>
        </section>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} torqbearingsStore</span>
        <Link href="/login">Customer account</Link>
      </div>
    </footer>
  );
}
