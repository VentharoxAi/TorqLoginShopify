import { ObjectId } from "mongodb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountDetailsForm } from "@/app/components/account-details-form";
import { StoreFooter, StoreHeader } from "@/app/components/store-chrome";
import { getSession } from "@/lib/auth";
import { getDatabase, type CustomerDocument } from "@/lib/db";

export default async function AccountDetailsPage() {
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId) redirect("/signup");

  const database = await getDatabase();
  const customer = await database.collection<CustomerDocument>("customers").findOne(
    { _id: new ObjectId(session.customerId) },
    {
      projection: {
        shop_details: 1,
        mobileNumber: 1,
      },
    },
  );
  if (!customer) redirect("/signup");
  const details = customer.shop_details;

  return (
    <>
      <StoreHeader />
      <main className="signup-page account-details-page">
        <section className="signup-card account-details-card">
          <Link className="account-details-close" href="/" aria-label="Close shop details and return home">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Link>
          <header className="signup-card-header">
            <h1>Confirm your shop details</h1>
            <p>We verify every shop before you can order. Our team may contact you on WhatsApp or by phone.</p>
          </header>
          <AccountDetailsForm
            completed={Boolean(details?.completedAt)}
            initialValues={{
              contactPersonName: details?.contactPersonName ?? "",
              shopName: details?.shopName ?? "",
              mobileNumber: customer.mobileNumber,
              contactMobileNumber: details?.contactMobileNumber ?? customer.mobileNumber,
              alternateMobileNumber: details?.alternateMobileNumber ?? "",
              shopAddress: details?.shopAddress ?? "",
              detailedAddress: details?.detailedAddress ?? "",
              city: details?.city ?? "",
              province: details?.province ?? "",
              comments: details?.comments ?? "",
            }}
          />
        </section>
      </main>
      <StoreFooter />
    </>
  );
}
