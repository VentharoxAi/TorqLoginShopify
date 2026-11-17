import { NextResponse } from "next/server";
import { destroyStaffSession } from "@/lib/staff-auth";
import { badOrigin } from "@/lib/http";
import { authorizeStaff, isStaffRequestSameOrigin } from "@/lib/admin-api";

export async function POST(request: Request) {
  if (!isStaffRequestSameOrigin(request)) return badOrigin();
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  try {
    await destroyStaffSession();
    return NextResponse.json({ message: "Signed out." });
  } catch (error) {
    console.error("Staff logout failed.", error);
    return NextResponse.json({ error: "Unable to sign out right now." }, { status: 500 });
  }
}
