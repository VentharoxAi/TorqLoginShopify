import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import { isValidPassword } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const body = await readJson(request);
  if (!body || typeof body.token !== "string" || !body.token) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  const token = body.token;
  if (!isValidPassword(body.password)) {
    return NextResponse.json({ error: "Password must be between 10 and 72 characters." }, { status: 400 });
  }
  if (body.password !== body.confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    const database = await getDatabase();
    const result = await database.collection<CustomerDocument>("customers").findOneAndUpdate(
      {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { $gt: new Date() },
      },
      {
        $set: { passwordHash },
        $inc: { sessionVersion: 1 },
        $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" },
      },
      { returnDocument: "before", projection: { _id: 1 } },
    );

    if (!result) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    }
    await database.collection("auth_sessions").deleteMany({ customerId: result._id });
    return NextResponse.json({ message: "Password updated." });
  } catch (error) {
    console.error("Password update failed.", error);
    return NextResponse.json({ error: "Unable to update your password right now." }, { status: 500 });
  }
}
