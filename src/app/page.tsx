import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCustomerHeaderCustomer, StoreFooter, StoreHeader } from "@/app/components/store-chrome";

export const metadata: Metadata = {
  title: "TORQ Bearings | Wholesale Bearings for Businesses",
  description: "Reliable bearings supplied by the carton to shops and businesses across Pakistan.",
};

const reasons = [
  {
    title: "Trusted quality",
    body: "Popular 6000, 6200 and 6300 series bearings, checked and packed for trade buyers.",
  },
  {
    title: "Wholesale carton prices",
    body: "Clear carton prices with pieces per carton shown on every product.",
  },
  {
    title: "Delivery across Pakistan",
    body: "Orders are packed and dispatched to shops in cities nationwide.",
  },
  {
    title: "Support on WhatsApp",
    body: "Message our team anytime for stock, prices and order updates.",
  },
];

const orderingSteps = [
  "Sign up to create your free account",
  "Add your shop details one time",
  "Browse bearings and add cartons to your cart",
  "Confirm your order; payment is due later",
];

export default async function HomePage() {
  const customer = await getCustomerHeaderCustomer();
  const homeAction = customer.status === "guest"
    ? { label: "Sign up / Sign in", href: "/signup" }
    : customer.status === "no-details"
      ? { label: "Complete shop details", href: "/account/details" }
      : customer.status === "pending"
        ? { label: "View account status", href: "/dashboard" }
        : customer.status === "approved"
          ? { label: "Browse products", href: "/store" }
          : null;

  return (
    <>
        <StoreHeader customer={customer} />
      <main className="landing-page">
        <section className="landing-hero" aria-label="TORQ Bearings">
          <Image
            src="/image2.jpg"
            alt="TORQ Bearings sealed industrial bearing"
            fill
            priority
            sizes="100vw"
          />
        </section>

        <div className="landing-content">
          <section className="landing-account-card" aria-labelledby="landing-title">
            <h1 id="landing-title">Wholesale bearings for shops and businesses</h1>
            <p>
              Sign up or create a free account to see our full catalog, live carton stock and wholesale prices.
            </p>
            {homeAction && (
              <div className="landing-actions">
                <Link className="landing-action-link" href={homeAction.href}>{homeAction.label}</Link>
              </div>
            )}
            <small>New customers can register with their mobile number. Catalog access follows account approval.</small>
          </section>

          <section className="landing-intro" aria-labelledby="landing-intro-title">
            <p className="landing-section-label">About TORQ Bearings</p>
            <h2 id="landing-intro-title">Dependable bearings, supplied by the carton</h2>
            <p>
              TORQ Bearings supplies ball bearings and industrial spare parts to retailers, workshops and businesses
              across Pakistan. We sell only by the carton at trade prices, so your shop always has reliable stock on the shelf.
            </p>
          </section>

          <section className="landing-reasons" aria-labelledby="landing-reasons-title">
            <h2 id="landing-reasons-title">Why shops choose TORQ</h2>
            <div className="landing-reason-grid">
              {reasons.map((reason) => (
                <article className="landing-reason-card" key={reason.title}>
                  <h3>{reason.title}</h3>
                  <p>{reason.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-process" id="how-it-works" aria-labelledby="landing-process-title">
            <h2 id="landing-process-title">How ordering works</h2>
            <ol>
              {orderingSteps.map((step, index) => (
                <li key={step}>
                  <span aria-hidden="true">{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
      <StoreFooter />
    </>
  );
}
