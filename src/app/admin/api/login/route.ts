import { NextResponse } from "next/server";
import { verify } from "@node-rs/argon2";
import { getDatabase, isDatabaseConfigured, type StaffUserDocument } from "@/lib/db";
import { createStaffSession, consumeStaffLoginAttempt } from "@/lib/staff-auth";
import { readJson, badOrigin } from "@/lib/http";
import { isStaffRequestSameOrigin } from "@/lib/admin-api";

export async function POST(request: Request) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }
  const body = await readJson(request);
  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.length > 128 ||
    body.password.length > 1024
  ) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  try {
    const database = await getDatabase();
    if (!(await consumeStaffLoginAttempt(request, body.username))) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 429 });
    }

    const user = await database.collection<StaffUserDocument>("staff_users").findOne({
      usernameNormalized: body.username.trim().toLowerCase(),
    });
    const passwordMatches = user
      ? await verify(user.passwordHash, body.password)
      : false;
    if (!user || !user.active || !passwordMatches) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    await createStaffSession(user);
    return NextResponse.json({ message: "Signed in." });
  } catch (error) {
    console.error("Staff login failed.", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }
}
