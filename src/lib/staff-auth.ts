import { createHash, randomBytes } from "node:crypto";
import type { WithId } from "mongodb";
import { cookies } from "next/headers";
import {
  getDatabase,
  type StaffLoginAttemptDocument,
  type StaffSessionDocument,
  type StaffUserDocument,
} from "@/lib/db";

const COOKIE_NAME = "torq_staff_session";
const SESSION_HOURS = 8;

export type StaffIdentity = {
  id: string;
  username: string;
  role: "admin" | "staff";
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getStaffSession(): Promise<StaffIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const database = await getDatabase();
  const session = await database
    .collection<StaffSessionDocument>("staff_sessions")
    .findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;

  const staffUser = await database.collection<StaffUserDocument>("staff_users").findOne({
    _id: session.staffUserId,
    active: true,
    sessionVersion: session.sessionVersion,
  });
  if (!staffUser) return null;

  return {
    id: staffUser._id.toString(),
    username: staffUser.username,
    role: staffUser.role,
  };
}

export async function createStaffSession(staffUser: WithId<StaffUserDocument>): Promise<void> {
  const cookieStore = await cookies();
  const priorToken = cookieStore.get(COOKIE_NAME)?.value;
  const database = await getDatabase();
  if (priorToken) {
    await database.collection<StaffSessionDocument>("staff_sessions").deleteOne({
      tokenHash: hashToken(priorToken),
    });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await database.collection<StaffSessionDocument>("staff_sessions").insertOne({
    tokenHash: hashToken(token),
    staffUserId: staffUser._id,
    sessionVersion: staffUser.sessionVersion,
    expiresAt,
    createdAt: new Date(),
  });
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/admin",
    expires: expiresAt,
  });
}

export async function destroyStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const database = await getDatabase();
    await database.collection<StaffSessionDocument>("staff_sessions").deleteOne({
      tokenHash: hashToken(token),
    });
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function consumeStaffLoginAttempt(
  request: Request,
  username: string,
): Promise<boolean> {
  const database = await getDatabase();
  const now = Date.now();
  const windowSize = 15 * 60 * 1000;
  const windowStart = Math.floor(now / windowSize) * windowSize;
  const ip =
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown";
  const usernameKey = username.trim().toLowerCase().slice(0, 64);
  const bucketIds = [
    createHash("sha256").update(`ip:${ip}:${windowStart}`).digest("hex"),
    createHash("sha256").update(`user:${usernameKey}:${ip}:${windowStart}`).digest("hex"),
  ];
  const attempts = database.collection<StaffLoginAttemptDocument>("staff_login_attempts");

  for (const [index, bucketId] of bucketIds.entries()) {
    await attempts.updateOne(
      { _id: bucketId },
      {
        $inc: { attempts: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart + windowSize + 60000) },
      },
      { upsert: true },
    );
    const bucket = await attempts.findOne<{ attempts: number }>({ _id: bucketId });
    const limit = index === 0 ? 20 : 10;
    if ((bucket?.attempts ?? 0) > limit) return false;
  }
  return true;
}

