import { MongoClient, type Db, type ObjectId } from "mongodb";

export type AccountStatus = "pending" | "approved" | "blocked";

export type CustomerDocument = {
  mobileNumber: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  status: AccountStatus;
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
    ]);
    return database;
  })();
  return globalForMongo.torqMongoDatabase;
}
