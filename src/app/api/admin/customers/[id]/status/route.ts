import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type AccountStatus, type CustomerDocument } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const body = await readJson(request);
  if (
    !body ||
    (body.status !== "pending" && body.status !== "approved" && body.status !== "blocked")
  ) {
    return NextResponse.json({ error: "Select a valid account status." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
  }
  try {
    const database = await getDatabase();
    const updated = await database.collection<CustomerDocument>("customers").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: body.status as AccountStatus } },
    );
    if (updated.matchedCount === 0) {
      return NextResponse.json({ error: "Customer account was not found." }, { status: 404 });
    }
    return NextResponse.json({ message: "Account status updated." });
  } catch (error) {
    console.error("Customer status update failed.", error);
    return NextResponse.json({ error: "Unable to update account status." }, { status: 500 });
  }
}
