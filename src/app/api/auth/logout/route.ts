import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { badOrigin, isSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  try {
    await destroySession();
    return NextResponse.json({ message: "Signed out." });
  } catch (error) {
    console.error("Session logout failed.", error);
    return NextResponse.json({ error: "Unable to sign out right now." }, { status: 500 });
  }
}
