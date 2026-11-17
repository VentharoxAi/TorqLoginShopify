import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import { getDatabase, isDatabaseConfigured, type StaffUserDocument } from "@/lib/db";
import { badOrigin, readJson } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff("admin");
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
  }
  if (id === authorization.staff!.id) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }
  const body = await readJson(request);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Choose whether this staff account is active." }, { status: 400 });
  }
  try {
    const result = await (await getDatabase()).collection<StaffUserDocument>("staff_users").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { active: body.active, updatedAt: new Date() },
        $inc: { sessionVersion: 1 },
      },
    );
    if (result.matchedCount !== 1) {
      return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    }
    return NextResponse.json({ message: body.active ? "Staff account activated." : "Staff account deactivated." });
  } catch (error) {
    console.error("Staff account update failed.", error);
    return NextResponse.json({ error: "Unable to update staff account." }, { status: 500 });
  }
}
