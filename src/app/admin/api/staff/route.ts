import { NextResponse } from "next/server";
import { hash } from "@node-rs/argon2";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";
import { getDatabase, isDatabaseConfigured, type StaffUserDocument } from "@/lib/db";
import { badOrigin, readJson } from "@/lib/http";

const passwordOptions = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function GET() {
  const authorization = await authorizeStaff("admin");
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  try {
    const users = await (await getDatabase()).collection<StaffUserDocument>("staff_users")
      .find({}, { projection: { username: 1, role: 1, active: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ createdAt: 1 })
      .toArray();
    return NextResponse.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Staff user list failed.", error);
    return NextResponse.json({ error: "Unable to load staff users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff("admin");
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const body = await readJson(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role === "admin" ? "admin" : body?.role === "staff" ? "staff" : null;
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    return NextResponse.json({ error: "Username must be 3–64 letters, numbers, dots, underscores or hyphens." }, { status: 400 });
  }
  if (password.length < 14 || password.length > 1024) {
    return NextResponse.json({ error: "Password must be at least 14 characters." }, { status: 400 });
  }
  if (!role) return NextResponse.json({ error: "Select a valid staff role." }, { status: 400 });

  try {
    const now = new Date();
    await (await getDatabase()).collection<StaffUserDocument>("staff_users").insertOne({
      username,
      usernameNormalized: username.toLowerCase(),
      passwordHash: await hash(password, passwordOptions),
      role,
      active: true,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ message: "Staff account created." }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "That staff username is already in use." }, { status: 409 });
    }
    console.error("Staff account creation failed.", error);
    return NextResponse.json({ error: "Unable to create staff account." }, { status: 500 });
  }
}
