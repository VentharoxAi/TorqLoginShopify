import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import { isValidPassword, isValidUsername, normalizeMobile } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Please submit a valid form." }, { status: 400 });

  const mobileNumber = normalizeMobile(body.mobileNumber);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!mobileNumber) {
    return NextResponse.json({ error: "Enter a valid mobile number with its country code." }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Username must be 3–32 characters using letters, numbers, dots, underscores or hyphens." }, { status: 400 });
  }
  if (!isValidPassword(body.password)) {
    return NextResponse.json({ error: "Password must be between 10 and 72 characters." }, { status: 400 });
  }
  if (body.password !== body.confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    const database = await getDatabase();
    await database.collection<CustomerDocument>("customers").insertOne({
      mobileNumber,
      username,
      usernameNormalized: username.toLowerCase(),
      passwordHash,
      status: "pending",
      createdAt: new Date(),
      sessionVersion: 0,
    });
    return NextResponse.json({ message: "Your account has been created and is awaiting approval." }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ error: "That username or mobile number is already registered." }, { status: 409 });
    }
    console.error("Customer signup failed.", error);
    return NextResponse.json({ error: "We could not create your account. Please try again." }, { status: 500 });
  }
}
