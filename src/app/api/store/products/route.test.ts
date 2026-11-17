import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStoreAccess: vi.fn(),
  getActiveShopifyProducts: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/store-access", () => ({ getStoreAccess: mocks.getStoreAccess }));
vi.mock("@/lib/shopify", () => ({
  getActiveShopifyProducts: mocks.getActiveShopifyProducts,
}));

import { GET } from "./route";

describe("approved Shopify product API", () => {
  beforeEach(() => {
    mocks.getStoreAccess.mockReset();
    mocks.getActiveShopifyProducts.mockReset().mockResolvedValue([{ title: "6300-2RS" }]);
  });

  it("returns active products for approved customers", async () => {
    mocks.getStoreAccess.mockResolvedValue({ kind: "approved" });
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ title: "6300-2RS" }],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getActiveShopifyProducts).toHaveBeenCalledOnce();
  });

  it.each([
    ["logged-out", "unauthenticated", 401],
    ["pending", "pending", 403],
    ["blocked", "blocked", 403],
    ["details-incomplete", "incomplete", 403],
  ])("denies %s customers before Shopify access", async (_label, kind, expectedStatus) => {
    mocks.getStoreAccess.mockResolvedValue({ kind });
    const response = await GET();

    expect(response.status).toBe(expectedStatus);
    expect(mocks.getActiveShopifyProducts).not.toHaveBeenCalled();
  });
});
