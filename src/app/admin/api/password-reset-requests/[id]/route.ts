import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import { getDatabase, isDatabaseConfigured, type PasswordResetRequestDocument } from "@/lib/db";
import { badOrigin, readJson } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Password reset request was not found." }, { status: 404 });
  }
  const body = await readJson(request);
  if (body?.status !== "sent") {
    return NextResponse.json({ error: "Invalid password reset request status." }, { status: 400 });
  }
  try {
    const result = await (await getDatabase()).collection<PasswordResetRequestDocument>("password_reset_requests").updateOne(
      {
        _id: new ObjectId(id),
        status: "pending",
        linkGeneratedAt: { $exists: true },
      },
      { $set: { status: "sent", sentAt: new Date() } },
    );
    if (result.matchedCount !== 1) {
      return NextResponse.json(
        { error: "Generate a reset link before marking this request as sent." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Request marked as sent." });
  } catch (error) {
    console.error("Staff reset request update failed.", error);
    return NextResponse.json({ error: "Unable to update the password reset request." }, { status: 500 });
  }
}
