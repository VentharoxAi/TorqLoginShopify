import { hash, Algorithm } from "@node-rs/argon2";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;
const username = (process.env.ADMIN_USERNAME ?? process.env.FIRST_ADMIN_USERNAME)?.trim();
const password = process.env.ADMIN_PASSWORD ?? process.env.FIRST_ADMIN_PASSWORD;

if (!uri || !databaseName || !username || !password) {
  throw new Error(
    "MONGODB_URI, MONGODB_DB, ADMIN_USERNAME and ADMIN_PASSWORD (or FIRST_ADMIN_USERNAME and FIRST_ADMIN_PASSWORD) are required.",
  );
}
if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username) || password.length < 14) {
  throw new Error("Use a 3–64 character username and a password of at least 14 characters.");
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const staffUsers = client.db(databaseName).collection("staff_users");
  if (await staffUsers.countDocuments({}) !== 0) {
    throw new Error("Staff users already exist; the first-admin seed is only for an empty staff table.");
  }

  await staffUsers.createIndex({ usernameNormalized: 1 }, { unique: true });
  const now = new Date();
  await staffUsers.insertOne({
    username,
    usernameNormalized: username.toLowerCase(),
    passwordHash: await hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
    role: "admin",
    active: true,
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
  console.log("Initial portal admin created.");
} finally {
  await client.close();
}
