import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { hash } from "@node-rs/argon2";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import { getDatabase, isDatabaseConfigured, type StaffUserDocument } from "@/lib/db";
import { badOrigin, readJson } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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
    return NextResponse.json({ error: "Use a separate admin to reset your password." }, { status: 400 });
  }
  const body = await readJson(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 14 || password.length > 1024) {
    return NextResponse.json({ error: "Password must be at least 14 characters." }, { status: 400 });
  }
  try {
    const result = await (await getDatabase()).collection<StaffUserDocument>("staff_users").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          passwordHash: await hash(password, {
            algorithm: 2,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          }),
          updatedAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
    );
    if (result.matchedCount !== 1) {
      return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    }
    return NextResponse.json({ message: "Staff password reset; existing sessions were revoked." });
  } catch (error) {
    console.error("Staff password reset failed.", error);
    return NextResponse.json({ error: "Unable to reset the staff password." }, { status: 500 });
  }
}
