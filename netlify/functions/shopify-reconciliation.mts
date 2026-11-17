import { runShopifyWorker } from "../../src/lib/shopify-outbox";

export default async function shopifyReconciliation() {
  const result = await runShopifyWorker();
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  schedule: "*/15 * * * *",
};
