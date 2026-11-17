import { NextResponse } from "next/server";
import type { Filter } from "mongodb";
import { authorizeStaff } from "@/lib/admin-api";
import {
  getDatabase,
  isDatabaseConfigured,
  type AccountStatus,
  type CustomerDocument,
} from "@/lib/db";
import { isAccountStatus } from "@/lib/verification";
import { normalizeMobile } from "@/lib/validation";

const pageSize = 25;

export async function GET(request: Request) {
  const authorization = await authorizeStaff();
  if (authorization.response) return authorization.response;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "MongoDB storage is not configured on the server." }, { status: 503 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const statusValue = url.searchParams.get("status") ?? "pending";
  if (!isAccountStatus(statusValue)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  if (!Number.isInteger(rawPage) || rawPage < 1) {
    return NextResponse.json({ error: "Invalid page number." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const phoneDigits = query.replace(/\D/g, "");
    const normalizedMobile =
      normalizeMobile(query) ??
      (phoneDigits.length === 11 && phoneDigits.startsWith("0")
        ? normalizeMobile(`+92${phoneDigits.slice(1)}`)
        : phoneDigits.length === 10 && phoneDigits.startsWith("3")
          ? normalizeMobile(`+92${phoneDigits}`)
          : null);
    const searchMatches: Filter<CustomerDocument>[] = [
      { "shop_details.shopName": { $regex: escapedQuery, $options: "i" } },
      { "shop_details.contactPersonName": { $regex: escapedQuery, $options: "i" } },
      { "shop_details.contactMobileNumber": { $regex: escapedQuery, $options: "i" } },
      { "shop_details.city": { $regex: escapedQuery, $options: "i" } },
      { mobileNumber: { $regex: escapedQuery, $options: "i" } },
    ];
    if (normalizedMobile) {
      searchMatches.push(
        { "shop_details.contactMobileNumber": normalizedMobile },
        { mobileNumber: normalizedMobile },
      );
    }
    const makeFilter = (status: AccountStatus): Filter<CustomerDocument> => ({
      $and: [
        { "shop_details.status": status },
        ...(query ? [{ $or: searchMatches }] : []),
      ],
    });
    const counts = await Promise.all(
      (["pending", "approved", "blocked"] as const).map((status) =>
        database.collection<CustomerDocument>("customers").countDocuments(makeFilter(status)),
      ),
    );
    const total = await database.collection<CustomerDocument>("customers").countDocuments(makeFilter(statusValue));
    const customers = await database.collection<CustomerDocument>("customers")
      .find(makeFilter(statusValue), {
        projection: {
          username: 1,
          mobileNumber: 1,
          shop_details: 1,
          createdAt: 1,
        },
      })
      .sort({ "shop_details.completedAt": -1, createdAt: -1, _id: -1 })
      .skip((rawPage - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return NextResponse.json({
      status: statusValue satisfies AccountStatus,
      counts: { pending: counts[0], approved: counts[1], blocked: counts[2] },
      page: rawPage,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      customers: customers.map((customer) => ({
        id: customer._id.toString(),
        shopName: customer.shop_details.shopName ?? "",
        contactPersonName: customer.shop_details.contactPersonName ?? "",
        city: customer.shop_details.city ?? "",
        mobileNumber: customer.shop_details.contactMobileNumber || customer.mobileNumber,
        status: customer.shop_details.status,
        submittedAt: customer.shop_details.completedAt ?? null,
      })),
    });
  } catch (error) {
    console.error("Staff customer list failed.", error);
    return NextResponse.json({ error: "Unable to load customers." }, { status: 500 });
  }
}
