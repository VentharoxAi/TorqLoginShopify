import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => {
  const session = {
    withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
    endSession: vi.fn(),
  };
  const customer = {
    _id: "unused",
    shop_details: { status: "pending", syncVersion: 3 },
  };
  const findOne = vi.fn();
  const updateOne = vi.fn();
  const insertOne = vi.fn();
  const collection = vi.fn();
  const getDatabase = vi.fn();
  const enqueueShopifySync = vi.fn();
  const syncCustomerShopifyNow = vi.fn();
  return {
    session,
    customer,
    findOne,
    updateOne,
    insertOne,
    collection,
    getDatabase,
    enqueueShopifySync,
    syncCustomerShopifyNow,
  };
});

vi.mock("@/lib/admin-api", () => ({
  authorizeStaff: async () => ({
    staff: { id: "0123456789abcdef01234567", username: "admin", role: "admin" },
    response: null,
  }),
  isStaffRequestSameOrigin: () => true,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/shopify-outbox", () => ({
  CUSTOMER_SHOPIFY_SYNC_TIMEOUT_MS: 20000,
  enqueueShopifySync: mocks.enqueueShopifySync,
  syncCustomerShopifyNow: mocks.syncCustomerShopifyNow,
}));

import { PATCH } from "./route";

const customerId = "abcdef0123456789abcdef01";

describe("transactional customer status changes", () => {
  beforeEach(() => {
    mocks.session.withTransaction.mockClear();
    mocks.session.endSession.mockClear();
    mocks.customer.shop_details.status = "pending";
    mocks.customer.shop_details.syncVersion = 3;
    mocks.findOne.mockReset().mockResolvedValue(mocks.customer);
    mocks.updateOne.mockReset().mockResolvedValue({ matchedCount: 1 });
    mocks.insertOne.mockReset().mockResolvedValue({});
    mocks.enqueueShopifySync.mockReset().mockResolvedValue(undefined);
    mocks.syncCustomerShopifyNow.mockReset().mockResolvedValue({
      state: "synced",
      lastError: "",
    });
    mocks.collection.mockImplementation((name: string) => {
      if (name === "customers") return { findOne: mocks.findOne, updateOne: mocks.updateOne };
      if (name === "status_events") return { insertOne: mocks.insertOne };
      return {};
    });
    mocks.getDatabase.mockResolvedValue({
      client: { startSession: () => mocks.session },
      collection: mocks.collection,
    });
  });

  it("requires a reason before a customer can be blocked", async () => {
    const response = await PATCH(
      new Request(`https://torq.example/admin/api/customers/${customerId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://torq.example" },
        body: JSON.stringify({ status: "blocked" }),
      }),
      { params: Promise.resolve({ id: customerId }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("writes the local status, audit event and outbox job within one transaction", async () => {
    const response = await PATCH(
      new Request(`https://torq.example/admin/api/customers/${customerId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://torq.example" },
        body: JSON.stringify({ status: "blocked", note: "Business verification failed." }),
      }),
      { params: Promise.resolve({ id: customerId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      shopifySync: { state: "synced" },
    });
    expect(mocks.session.withTransaction).toHaveBeenCalledOnce();
    const updateOptions = mocks.updateOne.mock.calls[0][2];
    const eventOptions = mocks.insertOne.mock.calls[0][1];
    expect(updateOptions.session).toBe(mocks.session);
    expect(eventOptions.session).toBe(mocks.session);
    expect(mocks.insertOne.mock.calls[0][0]).toMatchObject({
      oldStatus: "pending",
      newStatus: "blocked",
      note: "Business verification failed.",
    });
    expect(mocks.enqueueShopifySync).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(ObjectId),
      4,
      mocks.session,
    );
    expect(mocks.syncCustomerShopifyNow).toHaveBeenCalledOnce();
    expect(mocks.syncCustomerShopifyNow.mock.calls[0][0]).toBeInstanceOf(ObjectId);
    expect(typeof mocks.syncCustomerShopifyNow.mock.calls[0][1]).toBe("number");
  });

  it("keeps the portal status saved and reports a failed Shopify sync", async () => {
    mocks.syncCustomerShopifyNow.mockResolvedValueOnce({
      state: "failed",
      lastError: "Shopify Admin API returned HTTP 500.",
    });
    const response = await PATCH(
      new Request(`https://torq.example/admin/api/customers/${customerId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://torq.example" },
        body: JSON.stringify({ status: "blocked", note: "Business verification failed." }),
      }),
      { params: Promise.resolve({ id: customerId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "blocked",
      shopifySync: {
        state: "failed",
        lastError: "Shopify Admin API returned HTTP 500.",
      },
    });
    expect(mocks.enqueueShopifySync).toHaveBeenCalledOnce();
  });
});
