import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff } from "@/lib/admin-api";
import {
  getDatabase,
  isDatabaseConfigured,
  type AccountStatus,
  type CustomerDocument,
  type StatusEventDocument,
} from "@/lib/db";
import {
  enqueueShopifySync,
  syncCustomerShopifyNow,
  CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS,
  type ShopifySyncAttemptResult,
} from "@/lib/shopify-outbox";
import { isAccountStatus, statusChangeNoteError } from "@/lib/verification";
import { badOrigin, readJson } from "@/lib/http";
import { isStaffRequestSameOrigin } from "@/lib/admin-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const syncDeadlineAt = Date.now() + CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS;
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }

  const body = await readJson(request);
  if (!body || !isAccountStatus(body.status)) {
    return NextResponse.json({ error: "Select a valid account status." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const newStatus = body.status;
  const noteError = statusChangeNoteError(newStatus, body.note);
  if (noteError) return NextResponse.json({ error: noteError }, { status: 400 });

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  }

  const customerId = new ObjectId(id);
  const database = await getDatabase();
  const transaction = database.client.startSession();
  let notFound = false;
  let updatedStatus: AccountStatus | null = null;
  try {
    await transaction.withTransaction(async () => {
      const customers = database.collection<CustomerDocument>("customers");
      const customer = await customers.findOne({ _id: customerId }, { session: transaction });
      if (!customer) {
        notFound = true;
        return;
      }
      const oldStatus = customer.shop_details.status;
      updatedStatus = oldStatus;
      if (oldStatus === newStatus) return;

      const version = customer.shop_details.syncVersion + 1;
      const result = await customers.updateOne(
        { _id: customerId, "shop_details.status": oldStatus },
        {
          $set: {
            "shop_details.status": newStatus,
            "shop_details.syncVersion": version,
          },
        },
        { session: transaction },
      );
      if (result.matchedCount !== 1) throw new Error("Customer status changed concurrently.");

      await database.collection<StatusEventDocument>("status_events").insertOne(
        {
          customerId,
          staffUserId: new ObjectId(authorization.staff!.id),
          actorLabel: authorization.staff!.username,
          oldStatus,
          newStatus,
          note,
          eventType: "status-change",
          createdAt: new Date(),
        },
        { session: transaction },
      );
      await enqueueShopifySync(database, customerId, version, transaction);
      updatedStatus = newStatus;
    });
  } catch (error) {
    console.error("Customer verification update failed.", error);
    return NextResponse.json({ error: "Unable to update customer status." }, { status: 500 });
  } finally {
    await transaction.endSession();
  }

  if (notFound) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  let shopifySync: ShopifySyncAttemptResult = {
    state: "pending",
    lastError: "Sync is queued for a later attempt.",
  };
  try {
    shopifySync = await syncCustomerShopifyNow(customerId, syncDeadlineAt);
  } catch {
    // The local status, audit event and outbox job are already committed.
  }
  return NextResponse.json({
    message: "Customer status saved.",
    status: updatedStatus,
    shopifySync,
  });
}
