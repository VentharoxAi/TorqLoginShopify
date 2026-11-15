import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { hashToken } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export function isResetLinkConfigured(): boolean {
  return Boolean(process.env.APP_URL);
}

export async function createResetToken(customerId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const database = await getDatabase();
  const result = await database.collection("customers").updateOne(
    { _id: new ObjectId(customerId) },
    {
      $set: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    },
  );
  if (result.matchedCount !== 1) throw new Error("Customer account no longer exists.");
  return token;
}

export function createResetUrl(token: string): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required to create password reset links.");
  const url = new URL("/reset-password", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
