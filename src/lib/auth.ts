import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDatabase, type SessionDocument } from "@/lib/db";

const COOKIE_NAME = "torq_session";
const SESSION_DAYS = 7;

export type AuthSession = {
  role: "admin" | "customer";
  customerId: string | null;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  role: AuthSession["role"],
  customerId: string | null = null,
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const database = await getDatabase();
  let sessionVersion: number | undefined;
  if (role === "customer" && customerId) {
    const customer = await database
      .collection("customers")
      .findOne({ _id: new ObjectId(customerId) }, { projection: { sessionVersion: 1 } });
    if (!customer) throw new Error("Customer account no longer exists.");
    sessionVersion = typeof customer.sessionVersion === "number" ? customer.sessionVersion : 0;
  }
  await database.collection<SessionDocument>("auth_sessions").insertOne({
    tokenHash,
    role,
    customerId: customerId ? new ObjectId(customerId) : null,
    sessionVersion,
    expiresAt,
    createdAt: new Date(),
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const database = await getDatabase();
  const session = await database
    .collection<SessionDocument>("auth_sessions")
    .findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (session?.role === "customer" && session.customerId) {
    const customer = await database
      .collection("customers")
      .findOne(
        { _id: session.customerId },
        { projection: { sessionVersion: 1 } },
      );
    const customerVersion =
      customer && typeof customer.sessionVersion === "number" ? customer.sessionVersion : 0;
    if (!customer || customerVersion !== (session.sessionVersion ?? 0)) return null;
  }

  return session
    ? { role: session.role, customerId: session.customerId?.toString() ?? null }
    : null;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  try {
    if (token) {
      const database = await getDatabase();
      await database
        .collection<SessionDocument>("auth_sessions")
        .deleteOne({ tokenHash: hashToken(token) });
    }
  } finally {
    cookieStore.delete(COOKIE_NAME);
  }
}
