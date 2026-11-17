import Link from "next/link";
import { getCustomerHeaderCustomer } from "@/lib/customer-header";
import { CustomerHeader } from "@/app/components/customer-header";
import type { CustomerHeaderCustomer } from "@/lib/customer-header";

const storeUrl = "https://torqbearingsstore.myshopify.com";

export { getCustomerHeaderCustomer } from "@/lib/customer-header";

export async function StoreHeader({
  customer,
}: {
  customer?: CustomerHeaderCustomer;
} = {}) {
  const headerCustomer = customer ?? await getCustomerHeaderCustomer();
  return <CustomerHeader customer={headerCustomer} />;
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
        <Link href="/signup">Customer account</Link>
      </div>
    </footer>
  );
}
