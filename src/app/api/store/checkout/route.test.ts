import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const customerId = "abcdef0123456789abcdef01";
const checkoutKey = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDatabase: vi.fn(),
  getCustomer: vi.fn(),
  getShopifyCheckoutVariants: vi.fn(),
  createShopifyPortalDraftOrder: vi.fn(),
  completeShopifyPortalDraftOrder: vi.fn(),
  findShopifyPortalCheckout: vi.fn(),
  getShopifyPortalDraftOrder: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/http")>("@/lib/http");
  return { ...actual, isSameOrigin: () => true };
});

vi.mock("@/lib/shopify", () => ({
  completeShopifyPortalDraftOrder: mocks.completeShopifyPortalDraftOrder,
  createShopifyPortalDraftOrder: mocks.createShopifyPortalDraftOrder,
  findShopifyPortalCheckout: mocks.findShopifyPortalCheckout,
  getShopifyCheckoutVariants: mocks.getShopifyCheckoutVariants,
  getShopifyPortalDraftOrder: mocks.getShopifyPortalDraftOrder,
  ShopifyOperationError: class ShopifyOperationError extends Error {
    constructor(
      message: string,
      readonly outcomeUnknown = false,
      readonly requiredScope?: string,
    ) {
      super(message);
    }
  },
}));

import { POST } from "./route";
import { ShopifyOperationError } from "@/lib/shopify";

const productVariant = {
  variantId: "gid://shopify/ProductVariant/42",
  title: "6302-2RS",
  sku: "6302-2RS",
  unitPrice: 37200,
  inventoryQuantity: 4,
  availableForSale: true,
};

function request(body: unknown) {
  return new Request("https://torq.example/api/store/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://torq.example",
    },
    body: JSON.stringify(body),
  });
}

describe("approved customer Shopify checkout", () => {
  let orders: Map<string, Record<string, any>>;
  let orderCollection: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    orders = new Map();
    mocks.getSession.mockResolvedValue({ role: "customer", customerId });
    const approvedCustomer = {
      _id: { toString: () => customerId, equals: (other: { toString(): string }) => other.toString() === customerId },
      shopifyCustomerId: "gid://shopify/Customer/50",
      shop_details: {
        status: "approved",
        completedAt: new Date("2026-11-17T08:00:00.000Z"),
        contactPersonName: "Jane Doe",
        shopName: "Bearing House",
        contactMobileNumber: "+923001234567",
        shopAddress: "Shop 4",
        detailedAddress: "Market Road",
        city: "Lahore",
        province: "Punjab",
      },
    };
    mocks.getCustomer.mockImplementation(async (filter: Record<string, unknown>) =>
      filter["shop_details.status"] === "approved" ? approvedCustomer : null,
    );
    orderCollection = {
      findOne: vi.fn(async ({ _id }: { _id: string }) => {
        const document = orders.get(_id);
        return document ? { ...document } : null;
      }),
      insertOne: vi.fn(async (document: Record<string, any>) => {
        if (orders.has(document._id)) throw { code: 11000 };
        orders.set(document._id, { ...document });
        return { acknowledged: true };
      }),
      findOneAndUpdate: vi.fn(async ({ _id }: { _id: string }, update: Record<string, any>) => {
        const document = orders.get(_id);
        if (!document) return null;
        Object.assign(document, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete document[key];
        return { ...document };
      }),
      updateOne: vi.fn(async ({ _id, leaseId }: { _id: string; leaseId?: string }, update: Record<string, any>) => {
        const document = orders.get(_id);
        if (!document || (leaseId && document.leaseId !== leaseId)) return { matchedCount: 0 };
        Object.assign(document, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete document[key];
        return { matchedCount: 1 };
      }),
    };
    mocks.getDatabase.mockResolvedValue({
      collection: (name: string) => name === "customers"
        ? { findOne: mocks.getCustomer }
        : orderCollection,
    });
    mocks.getShopifyCheckoutVariants.mockResolvedValue({
      currencyCode: "PKR",
      variants: [productVariant],
    });
    mocks.createShopifyPortalDraftOrder.mockResolvedValue("gid://shopify/DraftOrder/90");
    mocks.completeShopifyPortalDraftOrder.mockResolvedValue({
      orderId: "gid://shopify/Order/100",
      orderName: "#100",
      totalPrice: 74400,
      currencyCode: "PKR",
    });
    mocks.findShopifyPortalCheckout.mockResolvedValue(null);
    mocks.getShopifyPortalDraftOrder.mockResolvedValue(null);
  });

  it("uses only server-validated variants and saves the real Shopify order", async () => {
    const response = await POST(request({
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 2 }],
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      order: {
        orderName: "#100",
        totalCartons: 2,
        totalPrice: 74400,
        currencyCode: "PKR",
      },
    });
    expect(mocks.getShopifyCheckoutVariants).toHaveBeenCalledWith(
      [productVariant.variantId],
      expect.objectContaining({ deadlineAt: expect.any(Number) }),
    );
    expect(mocks.createShopifyPortalDraftOrder).toHaveBeenCalledWith(expect.objectContaining({
      customerId: "gid://shopify/Customer/50",
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 2 }],
    }), expect.objectContaining({ deadlineAt: expect.any(Number) }));
    expect(orderCollection.insertOne).toHaveBeenCalledOnce();
    const savedOrder = [...orders.values()][0];
    expect(savedOrder).toMatchObject({
      state: "completed",
      shopifyOrderId: "gid://shopify/Order/100",
      orderName: "#100",
      totalPrice: 74400,
      totalCartons: 2,
      items: [{
        variantId: productVariant.variantId,
        quantity: 2,
        unitPrice: 37200,
      }],
    });
  });

  it("rejects orders above live inventory without creating a draft", async () => {
    mocks.getShopifyCheckoutVariants.mockResolvedValue({
      currencyCode: "PKR",
      variants: [{ ...productVariant, inventoryQuantity: 1 }],
    });
    const response = await POST(request({
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 2 }],
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "6302-2RS has only 1 carton(s) available. Please update your cart.",
    });
    expect(mocks.createShopifyPortalDraftOrder).not.toHaveBeenCalled();
  });

  it("checks local approval before contacting Shopify", async () => {
    mocks.getCustomer.mockResolvedValue(null);
    const response = await POST(request({
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 1 }],
    }));

    expect(response.status).toBe(403);
    expect(mocks.getShopifyCheckoutVariants).not.toHaveBeenCalled();
    expect(mocks.createShopifyPortalDraftOrder).not.toHaveBeenCalled();
  });

  it("returns an existing result on replay instead of creating a duplicate", async () => {
    const customer = await mocks.getCustomer({ "shop_details.status": "approved" });
    const intentId = `${customerId}:${checkoutKey}`;
    orders.set(intentId, {
      _id: intentId,
      customerId: customer._id,
      checkoutKey,
      payloadHash: createHash("sha256")
        .update(`${productVariant.variantId}:1`)
        .digest("hex"),
      state: "completed",
      createAttempted: true,
      orderName: "#100",
      totalCartons: 1,
      totalPrice: 37200,
      currencyCode: "PKR",
    });
    const response = await POST(request({
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 1 }],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      order: { orderName: "#100", totalCartons: 1, totalPrice: 37200 },
    });
    expect(mocks.createShopifyPortalDraftOrder).not.toHaveBeenCalled();
  });

  it("keeps ambiguous draft creation uncertain and never creates a second draft on retry", async () => {
    mocks.createShopifyPortalDraftOrder.mockRejectedValue(
      new ShopifyOperationError("Shopify Admin API request timed out.", true),
    );
    const body = {
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 1 }],
    };

    const firstResponse = await POST(request(body));
    expect(firstResponse.status).toBe(502);
    expect([...orders.values()][0]).toMatchObject({
      state: "uncertain",
      createAttempted: true,
    });

    const retryResponse = await POST(request(body));
    expect(retryResponse.status).toBe(502);
    expect(mocks.getShopifyCheckoutVariants).toHaveBeenCalledTimes(2);
    expect(mocks.createShopifyPortalDraftOrder).toHaveBeenCalledOnce();
    expect(mocks.findShopifyPortalCheckout).toHaveBeenCalledTimes(2);
  });

  it("reports the exact missing Shopify write scope", async () => {
    mocks.createShopifyPortalDraftOrder.mockRejectedValue(
      new ShopifyOperationError("Missing permission.", false, "write_draft_orders"),
    );
    const response = await POST(request({
      checkoutKey,
      items: [{ variantId: productVariant.variantId, quantity: 1 }],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Shopify setup is missing the required Admin API scope: write_draft_orders.",
    });
  });

  it("rejects client-supplied prices instead of accepting browser totals", async () => {
    const response = await POST(request({
      checkoutKey,
      total: 1,
      items: [{ variantId: productVariant.variantId, quantity: 1, price: 1 }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.getShopifyCheckoutVariants).not.toHaveBeenCalled();
  });
});
