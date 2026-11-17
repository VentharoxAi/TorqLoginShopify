import { redirect } from "next/navigation";
import { Storefront } from "@/app/components/storefront";
import { getCustomerHeaderCustomer } from "@/app/components/store-chrome";
import { getActiveShopifyProducts, type ShopifyStoreProduct } from "@/lib/shopify";
import { isDatabaseConfigured } from "@/lib/db";
import { getStoreAccess } from "@/lib/store-access";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  if (!isDatabaseConfigured()) redirect("/login");
  const access = await getStoreAccess();
  if (access.kind === "unauthenticated") redirect("/login");
  if (access.kind === "incomplete") redirect("/account/details");
  if (access.kind !== "approved") redirect("/dashboard");
  const customer = await getCustomerHeaderCustomer();

  let products: ShopifyStoreProduct[] | null = null;
  try {
    products = await getActiveShopifyProducts();
  } catch {
    console.error("Approved store page product request failed.");
  }

  return <Storefront products={products} customer={customer} />;
}
