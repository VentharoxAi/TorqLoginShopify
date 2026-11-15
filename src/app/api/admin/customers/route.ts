import { NextResponse } from "next/server";
import type { Filter } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type AccountStatus, type CustomerDocument } from "@/lib/db";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "all";
  let statusFilter: AccountStatus | undefined;
  if (status === "pending" || status === "approved" || status === "blocked") {
    statusFilter = status;
  } else if (status !== "all") {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }

  try {
    const filters: Filter<CustomerDocument>[] = [];
    if (query) {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filters.push({
        $or: [
          { username: { $regex: escapedQuery, $options: "i" } },
          { mobileNumber: { $regex: escapedQuery, $options: "i" } },
        ],
      });
    }
    if (statusFilter) filters.push({ status: statusFilter });

    const database = await getDatabase();
    const customers = await database
      .collection<CustomerDocument>("customers")
      .find(filters.length ? { $and: filters } : {}, {
        projection: { username: 1, mobileNumber: 1, status: 1, createdAt: 1 },
      })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    return NextResponse.json({
      customers: customers.map((customer) => ({
        id: customer._id.toString(),
        username: customer.username,
        mobileNumber: customer.mobileNumber,
        status: customer.status,
        createdAt: customer.createdAt,
      })),
    });
  } catch (error) {
    console.error("Admin customer listing failed.", error);
    return NextResponse.json({ error: "Unable to load customer accounts." }, { status: 500 });
  }
}
