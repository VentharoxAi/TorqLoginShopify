import { NextResponse } from "next/server";
import { createResetToken, createResetUrl, isResetLinkConfigured } from "@/lib/password-reset";
import { getSession } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
import { badOrigin, isSameOrigin } from "@/lib/http";
import { ObjectId } from "mongodb";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  if (!isResetLinkConfigured()) {
    return NextResponse.json({ error: "APP_URL is not configured on the server." }, { status: 503 });
  }

  const { id } = await context.params;
  try {
    if (!/^[\da-f]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
    }
    const database = await getDatabase();
    const customer = await database.collection<CustomerDocument>("customers").findOne(
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
    console.error("Admin password reset request failed.", error);
    return NextResponse.json({ error: "Unable to initiate password reset." }, { status: 500 });
  }
}
