import "server-only";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase, isDatabaseConfigured, type CustomerDocument } from "@/lib/db";

export type CustomerHeaderStatus =
  | "guest"
  | "no-details"
  | "pending"
  | "approved"
  | "blocked";

export type CustomerHeaderCustomer = {
  status: CustomerHeaderStatus;
  name: string;
};

export async function getCustomerHeaderCustomer(): Promise<CustomerHeaderCustomer> {
  if (!isDatabaseConfigured()) return { status: "guest", name: "" };
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId || !ObjectId.isValid(session.customerId)) {
    return { status: "guest", name: "" };
  }

  const database = await getDatabase();
  const customer = await database.collection<CustomerDocument>("customers").findOne(
    { _id: new ObjectId(session.customerId) },
    {
      projection: {
        username: 1,
        "shop_details.status": 1,
        "shop_details.completedAt": 1,
        "shop_details.contactPersonName": 1,
      },
    },
  );
  if (!customer) return { status: "guest", name: "" };

  const status = customer.shop_details?.status === "blocked"
    ? "blocked"
    : !customer.shop_details?.completedAt
      ? "no-details"
      : customer.shop_details.status === "approved"
        ? "approved"
        : "pending";
  return {
    status,
    name: customer.shop_details?.contactPersonName?.trim() || customer.username,
  };
}
