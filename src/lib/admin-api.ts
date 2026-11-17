import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { getStaffSession, type StaffIdentity } from "@/lib/staff-auth";

export function isStaffRequestSameOrigin(request: Request): boolean {
  return Boolean(request.headers.get("origin")) && isSameOrigin(request);
}

export async function authorizeStaff(
  requiredRole: "admin" | "staff" = "staff",
): Promise<{ staff: StaffIdentity | null; response: NextResponse | null }> {
  const staff = await getStaffSession();
  if (!staff) {
    return {
      staff: null,
      response: NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 }),
    };
  }
  if (requiredRole === "admin" && staff.role !== "admin") {
    return {
      staff: null,
      response: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }),
    };
  }
  return { staff, response: null };
}
