import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import { normalizeMobile } from "@/lib/validation";
import {
  enqueueShopifySync,
  syncCustomerShopifyNow,
  CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS,
  type ShopifySyncAttemptResult,
} from "@/lib/shopify-outbox";

const requiredFields = [
  ["contactPersonName", "Contact person name"],
  ["shopName", "Shop name"],
  ["contactMobileNumber", "Mobile / WhatsApp number"],
  ["shopAddress", "Shop address"],
  ["detailedAddress", "Detailed address"],
  ["city", "City"],
  ["province", "Province"],
] as const;

const allowedProvinces = new Set([
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu and Kashmir",
]);

export async function PATCH(request: Request) {
  const syncDeadlineAt = Date.now() + CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS;
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId) {
    return NextResponse.json({ error: "Sign in to update your account details." }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });

  const details: Record<(typeof requiredFields)[number][0], string> & {
    alternateMobileNumber: string;
    comments: string;
  } = {
    contactPersonName: "",
    shopName: "",
    contactMobileNumber: "",
    shopAddress: "",
    detailedAddress: "",
    city: "",
    province: "",
    alternateMobileNumber: "",
    comments: "",
  };

  for (const [field, label] of requiredFields) {
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value || value.length > 2000) {
      return NextResponse.json({ error: `${label} is required and must be 2,000 characters or fewer.` }, { status: 400 });
    }
    details[field] = value;
  }

  if (!allowedProvinces.has(details.province)) {
    return NextResponse.json({ error: "Select a valid province." }, { status: 400 });
  }
  const alternateValue = typeof body.alternateMobileNumber === "string" ? body.alternateMobileNumber.trim() : "";
  const alternateMobileNumber = alternateValue ? normalizeMobile(alternateValue) : "";
  if (alternateValue && !alternateMobileNumber) {
    return NextResponse.json({ error: "Enter a valid alternate mobile number with its country code." }, { status: 400 });
  }
  const contactMobileNumber = normalizeMobile(body.contactMobileNumber);
  if (!contactMobileNumber) {
    return NextResponse.json({ error: "Enter a valid mobile / WhatsApp number with its country code." }, { status: 400 });
  }
  const comments = typeof body.comments === "string" ? body.comments.trim() : "";
  if (comments.length > 1000) {
    return NextResponse.json({ error: "Comments must be 1,000 characters or fewer." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const now = new Date();
    const customerId = new ObjectId(session.customerId);
    const clientSession = database.client.startSession();
    let matchedCount = 0;
    try {
      await clientSession.withTransaction(async () => {
        const updated = await database.collection<CustomerDocument>("customers").updateOne(
          { _id: customerId },
          [
            {
              $set: {
                "shop_details.contactPersonName": details.contactPersonName,
                "shop_details.shopName": details.shopName,
                "shop_details.contactMobileNumber": contactMobileNumber,
                "shop_details.alternateMobileNumber": alternateMobileNumber,
                "shop_details.shopAddress": details.shopAddress,
                "shop_details.detailedAddress": details.detailedAddress,
                "shop_details.city": details.city,
                "shop_details.province": details.province,
                "shop_details.comments": comments,
                "shop_details.updatedAt": now,
                "shop_details.completedAt": { $ifNull: ["$shop_details.completedAt", now] },
                "shop_details.syncVersion": {
                  $add: [{ $ifNull: ["$shop_details.syncVersion", 0] }, 1],
                },
              },
            },
          ],
          { session: clientSession },
        );
        matchedCount = updated.matchedCount;
        if (matchedCount === 0) return;
        const customer = await database.collection<CustomerDocument>("customers").findOne(
          { _id: customerId },
          { projection: { "shop_details.syncVersion": 1 }, session: clientSession },
        );
        if (!customer) throw new Error("Customer account was not found after saving details.");
        await enqueueShopifySync(
          database,
          customerId,
          customer.shop_details.syncVersion,
          clientSession,
        );
      });
    } finally {
      await clientSession.endSession();
    }
    if (matchedCount === 0) {
      return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
    }
    let shopifySync: ShopifySyncAttemptResult = {
      state: "pending",
      lastError: "Sync is queued for a later attempt.",
    };
    try {
      shopifySync = await syncCustomerShopifyNow(customerId, syncDeadlineAt);
    } catch {
      // The local save and outbox job are already committed.
    }
    return NextResponse.json({
      message: "Your details have been saved.",
      shopifySync,
    });
  } catch (error) {
    console.error("Customer details update failed.", error);
    return NextResponse.json({ error: "Unable to save your details. Please try again." }, { status: 500 });
  }
}
