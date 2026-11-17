import { describe, expect, it } from "vitest";
import {
  canAccessStoreLocally,
  hasShopifyStatusTag,
  shopifyTagsForStatus,
  statusChangeNoteError,
} from "./verification";

describe("portal verification", () => {
  it("allows store access only for the local approved status", () => {
    expect(canAccessStoreLocally("approved")).toBe(true);
    expect(canAccessStoreLocally("pending")).toBe(false);
    expect(canAccessStoreLocally("blocked")).toBe(false);
  });

  it("replaces only verification tags and preserves unrelated Shopify tags", () => {
    const updated = shopifyTagsForStatus(
      ["wholesale", "vip", "approved", "blocked", "pending-verification"],
      "approved",
    );
    expect(updated).toEqual(["wholesale", "vip", "approved"]);
    expect(hasShopifyStatusTag(updated, "approved")).toBe(true);
    expect(hasShopifyStatusTag(["wholesale", "approved", "blocked"], "approved")).toBe(false);
  });

  it("requires a reason to block and limits optional notes", () => {
    expect(statusChangeNoteError("blocked", "  ")).toBe("A reason is required to block a customer.");
    expect(statusChangeNoteError("approved", undefined)).toBeNull();
    expect(statusChangeNoteError("pending", "x".repeat(1001))).toBe(
      "Notes must be 1,000 characters or fewer.",
    );
  });
});
