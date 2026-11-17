import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff } from "@/lib/admin-api";
import {
  getDatabase,
  isDatabaseConfigured,
  type CustomerDocument,
  type ShopifySyncJobDocument,
  type StatusEventDocument,
} from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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
    const database = await getDatabase();
    const customer = await database.collection<CustomerDocument>("customers").findOne({
      _id: new ObjectId(id),
    });
    if (!customer) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });

    const [syncJob, history] = await Promise.all([
      database.collection<ShopifySyncJobDocument>("shopify_sync_jobs").findOne({
        _id: customer._id,
      }),
      database.collection<StatusEventDocument>("status_events")
        .find({ customerId: customer._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
    ]);

    return NextResponse.json({
      customer: {
        id: customer._id.toString(),
        username: customer.username,
        accountMobileNumber: customer.mobileNumber,
        status: customer.shop_details.status,
        details: {
          contactPersonName: customer.shop_details.contactPersonName ?? "",
          shopName: customer.shop_details.shopName ?? "",
          contactMobileNumber: customer.shop_details.contactMobileNumber ?? "",
          alternateMobileNumber: customer.shop_details.alternateMobileNumber ?? "",
          shopAddress: customer.shop_details.shopAddress ?? "",
          detailedAddress: customer.shop_details.detailedAddress ?? "",
          city: customer.shop_details.city ?? "",
          province: customer.shop_details.province ?? "",
          comments: customer.shop_details.comments ?? "",
          submittedAt: customer.shop_details.completedAt ?? null,
        },
        shopifySync: {
          state: syncJob?.status === "synced"
            ? "synced"
            : syncJob?.status === "failed"
              ? "failed"
              : "pending",
          lastError: syncJob?.lastError ?? "",
          attempts: syncJob?.attempts ?? 0,
          syncedAt: syncJob?.syncedAt ?? null,
        },
      },
      history: history.map((event) => ({
        id: event._id.toString(),
        actor: event.actorLabel,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        note: event.note,
        createdAt: event.createdAt,
        eventType: event.eventType,
      })),
    });
  } catch (error) {
    console.error("Staff customer detail failed.", error);
    return NextResponse.json({ error: "Unable to load customer details." }, { status: 500 });
  }
}
