import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/app/components/admin-header";
import { CustomerReview } from "@/app/components/customer-review";
import { getStaffSession } from "@/lib/staff-auth";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailsPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const { id } = await params;
  if (!/^[\da-f]{24}$/i.test(id)) notFound();

  return (
    <main className="app-page">
      <AdminHeader staff={staff} />
      <section className="content-wrap">
        <div className="page-heading"><h1>Customer details</h1><p>Review submitted shop information and verification history.</p></div>
        <CustomerReview customerId={id} />
      </section>
    </main>
  );
}
