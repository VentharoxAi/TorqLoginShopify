import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import {
  createResetToken,
  createResetUrl,
  isResetLinkConfigured,
} from "@/lib/password-reset";
import {
  getDatabase,
  isDatabaseConfigured,
  type CustomerDocument,
  type PasswordResetRequestDocument,
} from "@/lib/db";
import { badOrigin } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  if (!isResetLinkConfigured()) {
    return NextResponse.json({ error: "APP_URL is not configured on the server." }, { status: 503 });
  }
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Password reset request was not found." }, { status: 404 });
  }
  try {
    const database = await getDatabase();
    const requests = database.collection<PasswordResetRequestDocument>("password_reset_requests");
    const resetRequest = await requests.findOne({ _id: new ObjectId(id), status: "pending" });
    if (!resetRequest) {
      return NextResponse.json({ error: "Password reset request was not found or is already complete." }, { status: 404 });
    }
    const customer = await database.collection<CustomerDocument>("customers").findOne(
      { _id: resetRequest.customerId },
      { projection: { username: 1, mobileNumber: 1 } },
    );
    if (!customer) {
      return NextResponse.json({ error: "The customer account no longer exists." }, { status: 404 });
    }

    const token = await createResetToken(customer._id.toString());
    const updated = await requests.updateOne(
      { _id: resetRequest._id, status: "pending" },
      { $set: { linkGeneratedAt: new Date() } },
    );
    if (updated.matchedCount !== 1) {
      return NextResponse.json({ error: "This request was already completed." }, { status: 409 });
    }
    return NextResponse.json({
      resetUrl: createResetUrl(token),
      username: customer.username,
      mobileNumber: customer.mobileNumber,
    });
  } catch (error) {
    console.error("Staff reset link generation failed.", error);
    return NextResponse.json({ error: "Unable to generate the password reset link." }, { status: 500 });
  }
}
