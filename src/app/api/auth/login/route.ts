import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import { normalizeMobile } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const body = await readJson(request);
  const mobileNumber = normalizeMobile(body?.mobileNumber);
  if (!body || !mobileNumber || typeof body.password !== "string") {
    return NextResponse.json({ error: "Enter a valid mobile number and password." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const customer = await database
      .collection<CustomerDocument>("customers")
      .findOne({ mobileNumber });
    if (!customer || !(await bcrypt.compare(body.password, customer.passwordHash))) {
      return NextResponse.json({ error: "Invalid mobile number or password." }, { status: 401 });
    }

    await createSession("customer", customer._id.toString());
    const redirectTo = !customer.shop_details?.completedAt
      ? "/account/details"
      : customer.shop_details.status === "approved"
        ? "/store"
        : "/dashboard";
    return NextResponse.json({ message: "Signed in.", redirectTo });
  } catch (error) {
    console.error("Customer login failed.", error);
    return NextResponse.json({ error: "Unable to sign in right now. Please try again." }, { status: 500 });
  }
}
