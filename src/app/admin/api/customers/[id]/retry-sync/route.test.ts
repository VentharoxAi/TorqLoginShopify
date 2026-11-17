import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retryCustomerShopifySync: vi.fn(),
  syncCustomerShopifyNow: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => ({
  authorizeStaff: async () => ({ staff: { id: "staff-id" }, response: null }),
  isStaffRequestSameOrigin: () => true,
}));
vi.mock("@/lib/db", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/shopify-outbox", () => ({
  CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS: 20000,
  retryCustomerShopifySync: mocks.retryCustomerShopifySync,
  syncCustomerShopifyNow: mocks.syncCustomerShopifyNow,
}));
vi.mock("@/lib/http", () => ({ badOrigin: () => new Response(null, { status: 403 }) }));

import { POST } from "./route";

const customerId = "abcdef0123456789abcdef01";

describe("staff Shopify sync retry", () => {
  beforeEach(() => {
    mocks.retryCustomerShopifySync.mockReset().mockResolvedValue(undefined);
    mocks.syncCustomerShopifyNow.mockReset().mockResolvedValue({
      state: "synced",
      lastError: "",
    });
  });

  it("awaits the targeted retry and returns its actual sync state", async () => {
    const response = await POST(
      new Request(`https://torq.example/admin/api/customers/${customerId}/retry-sync`, {
        method: "POST",
        headers: { origin: "https://torq.example" },
      }),
      { params: Promise.resolve({ id: customerId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      shopifySync: { state: "synced" },
    });
    expect(mocks.retryCustomerShopifySync).toHaveBeenCalledOnce();
    expect(mocks.syncCustomerShopifyNow).toHaveBeenCalledOnce();
  });
});
