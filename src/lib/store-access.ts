import "server-only";
import { ObjectId } from "mongodb";
import { getSession } from "./auth";
import { getDatabase, type CustomerDocument } from "./db";

export type StoreAccessResult =
  | { kind: "unauthenticated" }
  | { kind: "incomplete" }
  | { kind: "pending" }
  | { kind: "blocked" }
  | { kind: "approved"; customerId: ObjectId };

export async function getStoreAccess(): Promise<StoreAccessResult> {
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId) {
    return { kind: "unauthenticated" };
  }

  const database = await getDatabase();
  const customer = await database.collection<CustomerDocument>("customers").findOne(
    { _id: new ObjectId(session.customerId) },
    { projection: { "shop_details.status": 1, "shop_details.completedAt": 1 } },
  );
  if (!customer) return { kind: "unauthenticated" };
  if (!customer.shop_details?.completedAt) return { kind: "incomplete" };
  if (customer.shop_details.status === "approved") {
    return { kind: "approved", customerId: customer._id };
  }
  if (customer.shop_details.status === "blocked") return { kind: "blocked" };
  return { kind: "pending" };
}
