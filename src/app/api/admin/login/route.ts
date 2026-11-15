import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSession } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const body = await readJson(request);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Enter your admin username and password." }, { status: 400 });
  }

  const username = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!username || !configuredPassword) {
    return NextResponse.json({ error: "Admin sign-in is not configured on the server." }, { status: 503 });
  }
  if (Buffer.byteLength(configuredPassword, "utf8") < 12) {
    return NextResponse.json({ error: "Admin password must be at least 12 characters." }, { status: 503 });
  }
  try {
    const submittedPassword = Buffer.from(body.password, "utf8");
    const expectedPassword = Buffer.from(configuredPassword, "utf8");
    const passwordMatches =
      submittedPassword.length === expectedPassword.length &&
      timingSafeEqual(submittedPassword, expectedPassword);
    if (
      body.username.trim() !== username ||
      !passwordMatches
    ) {
      return NextResponse.json({ error: "Invalid admin username or password." }, { status: 401 });
    }
    await createSession("admin");
    return NextResponse.json({ message: "Signed in." });
  } catch (error) {
    console.error("Admin login failed.", error);
    return NextResponse.json({ error: "Unable to sign in right now. Please try again." }, { status: 500 });
  }
}
