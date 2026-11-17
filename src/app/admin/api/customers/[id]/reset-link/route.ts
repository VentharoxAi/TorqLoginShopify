import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import { createResetToken, createResetUrl, isResetLinkConfigured } from "@/lib/password-reset";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
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
    return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
  }
  try {
    const customer = await (await getDatabase()).collection<CustomerDocument>("customers").findOne(
      { _id: new ObjectId(id) },
      { projection: { mobileNumber: 1 } },
    );
    if (!customer) {
      return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
    }
    const token = await createResetToken(customer._id.toString());
    return NextResponse.json({
      resetUrl: createResetUrl(token),
      mobileNumber: customer.mobileNumber,
    });
  } catch (error) {
    console.error("Staff customer reset link request failed.", error);
    return NextResponse.json({ error: "Unable to initiate password reset." }, { status: 500 });
  }
}
