import { MongoClient, type Db, type ObjectId } from "mongodb";

export type AccountStatus = "pending" | "approved" | "blocked";

export type CustomerDocument = {
  mobileNumber: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  shop_details: {
    status: AccountStatus;
    contactPersonName?: string;
    shopName?: string;
    contactMobileNumber?: string;
    alternateMobileNumber?: string;
    shopAddress?: string;
    detailedAddress?: string;
    city?: string;
    province?: string;
    comments?: string;
    completedAt?: Date;
    updatedAt?: Date;
    syncVersion: number;
  };
  shopifyCustomerId?: string;
  createdAt: Date;
  sessionVersion?: number;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
};

export type SessionDocument = {
  tokenHash: string;
  role: "admin" | "customer";
  customerId: ObjectId | null;
  sessionVersion?: number;
  expiresAt: Date;
  createdAt: Date;
};

export type PasswordResetRequestDocument = {
  customerId: ObjectId;
  mobileNumber: string;
  status: "pending" | "sent";
  createdAt: Date;
  linkGeneratedAt?: Date;
  sentAt?: Date;
};

export type StaffUserDocument = {
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  role: "admin" | "staff";
  active: boolean;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffSessionDocument = {
  tokenHash: string;
  staffUserId: ObjectId;
  sessionVersion: number;
  expiresAt: Date;
  createdAt: Date;
};

export type StaffLoginAttemptDocument = {
  _id: string;
  attempts: number;
  expiresAt: Date;
};

export type StatusEventDocument = {
  customerId: ObjectId;
  staffUserId: ObjectId | null;
  actorLabel: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
  note: string;
  eventType: "status-change" | "reconciled";
  createdAt: Date;
};

export type ShopifySyncJobDocument = {
  _id: ObjectId;
  customerId: ObjectId;
  version: number;
  status: "pending" | "processing" | "failed" | "synced";
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
};

export type ShopifyOrderDocument = {
  _id: string;
  customerId: ObjectId;
  checkoutKey: string;
  payloadHash: string;
  state: "processing" | "uncertain" | "failed" | "completed";
  createAttempted: boolean;
  leaseId?: string;
  leaseUntil?: Date;
  draftOrderId?: string;
  shopifyOrderId?: string;
  orderName?: string;
  items?: Array<{
    variantId: string;
    title: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalCartons?: number;
  totalPrice?: number;
  currencyCode?: string;
  createdAt: Date;
  updatedAt: Date;
};

type MongoGlobals = typeof globalThis & {
  torqMongoClient?: MongoClient;
  torqMongoDatabase?: Promise<Db>;
};

const globalForMongo = globalThis as MongoGlobals;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_DB);
}

export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB;
  if (!uri || !databaseName) {
    throw new Error("MONGODB_URI and MONGODB_DB are required.");
  }

  globalForMongo.torqMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
  });
  globalForMongo.torqMongoDatabase ??= (async () => {
    const client = await globalForMongo.torqMongoClient!.connect();
    const database = client.db(databaseName);
    await Promise.all([
      database.collection<CustomerDocument>("customers").createIndexes([
        { key: { mobileNumber: 1 }, unique: true },
        { key: { usernameNormalized: 1 }, unique: true },
        { key: { "shop_details.status": 1, createdAt: -1 } },
        { key: { shopifyCustomerId: 1 }, sparse: true },
      ]),
      database.collection<SessionDocument>("auth_sessions").createIndexes([
        { key: { tokenHash: 1 }, unique: true },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]),
      database.collection<PasswordResetRequestDocument>("password_reset_requests").createIndexes([
        { key: { status: 1, createdAt: -1 } },
        {
          key: { mobileNumber: 1 },
          unique: true,
          partialFilterExpression: { status: "pending" },
        },
      ]),
      database.collection<StaffUserDocument>("staff_users").createIndexes([
        { key: { usernameNormalized: 1 }, unique: true },
      ]),
      database.collection<StaffSessionDocument>("staff_sessions").createIndexes([
        { key: { tokenHash: 1 }, unique: true },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
        { key: { staffUserId: 1 } },
      ]),
      database.collection<StaffLoginAttemptDocument>("staff_login_attempts").createIndexes([
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ]),
      database.collection<StatusEventDocument>("status_events").createIndexes([
        { key: { customerId: 1, createdAt: -1 } },
      ]),
      database.collection<ShopifySyncJobDocument>("shopify_sync_jobs").createIndexes([
        { key: { status: 1, nextAttemptAt: 1 } },
        { key: { leaseUntil: 1 } },
      ]),
      database.collection<ShopifyOrderDocument>("shopify_orders").createIndexes([
        { key: { customerId: 1, checkoutKey: 1 }, unique: true },
        { key: { shopifyOrderId: 1 }, unique: true, sparse: true },
      ]),
    ]);
    return database;
  })();
  return globalForMongo.torqMongoDatabase;
}
