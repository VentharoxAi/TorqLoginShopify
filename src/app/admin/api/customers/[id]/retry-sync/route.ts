import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff } from "@/lib/admin-api";
import { isDatabaseConfigured } from "@/lib/db";
import {
  retryCustomerShopifySync,
  syncCustomerShopifyNow,
  CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS,
  type ShopifySyncAttemptResult,
} from "@/lib/shopify-outbox";
import { badOrigin } from "@/lib/http";
import { isStaffRequestSameOrigin } from "@/lib/admin-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const syncDeadlineAt = Date.now() + CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS;
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  }
  try {
    const customerId = new ObjectId(id);
    await retryCustomerShopifySync(customerId);
    let shopifySync: ShopifySyncAttemptResult = {
      state: "pending",
      lastError: "Sync is queued for a later attempt.",
    };
    try {
      shopifySync = await syncCustomerShopifyNow(customerId, syncDeadlineAt);
    } catch {
      // The retry job is already durable and the scheduled worker can recover it.
    }
    return NextResponse.json({ message: "Shopify sync attempt completed.", shopifySync });
  } catch (error) {
    if (error instanceof Error && error.message === "Customer account was not found.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Shopify retry request failed.", error);
    return NextResponse.json({ error: "Unable to queue Shopify sync." }, { status: 500 });
  }
}
