import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getDatabase,
  isDatabaseConfigured,
  type PasswordResetRequestDocument,
} from "@/lib/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  try {
    const database = await getDatabase();
    const requestsCollection = database.collection<PasswordResetRequestDocument>("password_reset_requests");
    const [requests, pendingCount] = await Promise.all([
      requestsCollection
        .find({}, { projection: { customerId: 1, mobileNumber: 1, status: 1, createdAt: 1, linkGeneratedAt: 1, sentAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      requestsCollection.countDocuments({ status: "pending" }),
    ]);

    return NextResponse.json({
      pendingCount,
      requests: requests.map((resetRequest) => ({
        id: resetRequest._id.toString(),
        mobileNumber: resetRequest.mobileNumber,
        status: resetRequest.status,
        createdAt: resetRequest.createdAt,
        linkGeneratedAt: resetRequest.linkGeneratedAt ?? null,
        sentAt: resetRequest.sentAt ?? null,
      })),
    });
  } catch (error) {
    console.error("Admin password reset request list failed.", error);
    return NextResponse.json({ error: "Unable to load password reset requests." }, { status: 500 });
  }
}
