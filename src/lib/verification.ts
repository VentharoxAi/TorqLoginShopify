import type { AccountStatus } from "@/lib/db";

export const SHOPIFY_STATUS_TAGS = [
  "pending-verification",
  "approved",
  "blocked",
] as const;

const statusTag: Record<AccountStatus, (typeof SHOPIFY_STATUS_TAGS)[number]> = {
  pending: "pending-verification",
  approved: "approved",
  blocked: "blocked",
};

export function shopifyStatusTag(status: AccountStatus): (typeof SHOPIFY_STATUS_TAGS)[number] {
  return statusTag[status];
}

export function shopifyTagsForStatus(
  existingTags: readonly string[],
  status: AccountStatus,
): string[] {
  return [
    ...existingTags.filter((tag) => !SHOPIFY_STATUS_TAGS.includes(tag as (typeof SHOPIFY_STATUS_TAGS)[number])),
    shopifyStatusTag(status),
  ];
}

export function hasShopifyStatusTag(
  existingTags: readonly string[],
  status: AccountStatus,
): boolean {
  const foundStatusTags = existingTags.filter((tag) =>
    SHOPIFY_STATUS_TAGS.includes(tag as (typeof SHOPIFY_STATUS_TAGS)[number]),
  );
  return foundStatusTags.length === 1 && foundStatusTags[0] === shopifyStatusTag(status);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return value === "pending" || value === "approved" || value === "blocked";
}

export function canAccessStoreLocally(status: AccountStatus): boolean {
  return status === "approved";
}

export function statusChangeNoteError(status: AccountStatus, note: unknown): string | null {
  if (typeof note !== "string") {
    return status === "blocked" ? "A reason is required to block a customer." : null;
  }
  const trimmedNote = note.trim();
  if (status === "blocked" && !trimmedNote) {
    return "A reason is required to block a customer.";
  }
  if (trimmedNote.length > 1000) {
    return "Notes must be 1,000 characters or fewer.";
  }
  return null;
}
