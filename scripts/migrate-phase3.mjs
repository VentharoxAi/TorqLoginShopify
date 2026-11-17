import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;

if (!uri || !databaseName) {
  throw new Error("MONGODB_URI and MONGODB_DB are required.");
}

const legacyFields = [
  "status",
  "contactPersonName",
  "shopName",
  "contactMobileNumber",
  "alternateMobileNumber",
  "shopAddress",
  "detailedAddress",
  "city",
  "province",
  "comments",
  "detailsCompletedAt",
  "detailsUpdatedAt",
];
const validStatuses = new Set(["pending", "approved", "blocked"]);
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const database = client.db(databaseName);
  const customers = database.collection("customers");
  const cursor = customers.find({});
  const operations = [];

  for await (const customer of cursor) {
    const currentDetails =
      customer.shop_details && typeof customer.shop_details === "object"
        ? customer.shop_details
        : {};
    const status = validStatuses.has(currentDetails.status)
      ? currentDetails.status
      : validStatuses.has(customer.status)
        ? customer.status
        : "pending";
    const shopDetails = {
      ...currentDetails,
      status,
      syncVersion: Number.isInteger(currentDetails.syncVersion)
        ? currentDetails.syncVersion
        : 0,
    };

    for (const field of legacyFields.slice(1, 10)) {
      if (shopDetails[field] === undefined && customer[field] !== undefined) {
        shopDetails[field] = customer[field];
      }
    }
    shopDetails.completedAt ??= customer.detailsCompletedAt;
    shopDetails.updatedAt ??= customer.detailsUpdatedAt;
    for (const field of ["completedAt", "updatedAt"]) {
      if (shopDetails[field] === undefined) delete shopDetails[field];
    }

    const unset = Object.fromEntries(legacyFields.map((field) => [field, ""]));
    operations.push({
      updateOne: {
        filter: { _id: customer._id },
        update: { $set: { shop_details: shopDetails }, $unset: unset },
      },
    });

    if (operations.length === 500) {
      await customers.bulkWrite(operations, { ordered: false });
      operations.length = 0;
    }
  }
  if (operations.length) await customers.bulkWrite(operations, { ordered: false });

  await Promise.all([
    customers.createIndexes([
      { key: { "shop_details.status": 1, createdAt: -1 } },
      { key: { shopifyCustomerId: 1 }, sparse: true },
    ]),
    database.collection("staff_users").createIndexes([
      { key: { usernameNormalized: 1 }, unique: true },
    ]),
    database.collection("staff_sessions").createIndexes([
      { key: { tokenHash: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { staffUserId: 1 } },
    ]),
    database.collection("staff_login_attempts").createIndexes([
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ]),
    database.collection("status_events").createIndexes([
      { key: { customerId: 1, createdAt: -1 } },
    ]),
    database.collection("shopify_sync_jobs").createIndexes([
      { key: { status: 1, nextAttemptAt: 1 } },
      { key: { leaseUntil: 1 } },
    ]),
  ]);
  console.log("Phase 3 migration completed.");
} finally {
  await client.close();
}
