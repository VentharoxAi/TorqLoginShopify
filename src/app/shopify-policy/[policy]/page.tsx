import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const policies = new Set([
  "privacy-policy",
  "shipping-policy",
  "refund-policy",
  "terms-of-service",
]);

export default async function ShopifyPolicyRedirect({
  params,
}: {
  params: Promise<{ policy: string }>;
}) {
  const { policy } = await params;
  if (!policies.has(policy)) notFound();

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("SHOPIFY_STORE_DOMAIN must be configured to open store policies.");
  }

  redirect(`https://${domain}/policies/${policy}`);
}
