import { NextResponse } from "next/server";
import { getDatabase, isDatabaseConfigured, type CustomerDocument, type PasswordResetRequestDocument } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import { normalizeMobile } from "@/lib/validation";

const confirmation =
  "If this number is registered, your reset request has been received. Our team will verify the account and send a secure WhatsApp reset link shortly.";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }

  const body = await readJson(request);
  const mobileNumber = normalizeMobile(body?.mobileNumber);
  if (!mobileNumber) {
    return NextResponse.json({ error: "Enter a valid mobile number in international format." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const customer = await database.collection<CustomerDocument>("customers").findOne(
      { mobileNumber },
      { projection: { _id: 1 } },
    );

    if (customer) {
      const requests = database.collection<PasswordResetRequestDocument>("password_reset_requests");
      const now = new Date();
      const [recentCount, dailyCount] = await Promise.all([
        requests.countDocuments({
          customerId: customer._id,
          createdAt: { $gte: new Date(now.getTime() - 15 * 60 * 1000) },
        }),
        requests.countDocuments({
          customerId: customer._id,
          createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        }),
      ]);

      if (recentCount < 3 && dailyCount < 5) {
        try {
          await requests.insertOne({
            customerId: customer._id,
            mobileNumber,
            status: "pending",
            createdAt: now,
          });
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
        }
      }
    }

    return NextResponse.json({ message: confirmation });
  } catch (error) {
    console.error("Password reset request creation failed.", error);
    return NextResponse.json({ error: "Unable to submit your request right now." }, { status: 500 });
  }
}
