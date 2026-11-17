import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeShopifyPortalDraftOrder,
  createShopifyPortalDraftOrder,
  ensureShopifyCustomer,
  findShopifyPortalCheckout,
  getActiveShopifyProducts,
  getShopifyCheckoutVariants,
  writeShopifyMetafields,
  writeShopifyStatusTags,
} from "./shopify";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("./db", () => ({ getDatabase: mocks.getDatabase }));

function graphQLResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function oauthResponse(
  accessToken = "server-token-for-test",
  expiresIn = 3600,
): Response {
  return new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createTokenDatabase() {
  let document: Record<string, unknown> | null = null;
  const clone = () => document && structuredClone(document);
  const collection = {
    updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, any>, options?: { upsert?: boolean }) => {
      if (!document && options?.upsert) document = { _id: filter._id };
      if (!document || document._id !== filter._id) return { matchedCount: 0 };
      if (
        filter["token.fingerprint"] &&
        (document.token as Record<string, unknown> | undefined)?.fingerprint !== filter["token.fingerprint"]
      ) {
        return { matchedCount: 0 };
      }
      if (filter.refreshLeaseId && document.refreshLeaseId !== filter.refreshLeaseId) {
        return { matchedCount: 0 };
      }
      Object.assign(document, update.$setOnInsert, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete document[key];
      return { matchedCount: 1 };
    }),
    findOne: vi.fn(async () => clone()),
    findOneAndUpdate: vi.fn(async (
      filter: { $or: Array<Record<string, Record<string, unknown>>> },
      update: { $set: Record<string, unknown> },
    ) => {
      if (!document) return null;
      const leaseIsAvailable = filter.$or.some((condition) =>
        condition.refreshLeaseUntil?.$exists === false
          ? document?.refreshLeaseUntil === undefined
          : document?.refreshLeaseUntil instanceof Date &&
            document.refreshLeaseUntil <= (condition.refreshLeaseUntil?.$lte as Date),
      );
      if (!leaseIsAvailable) return null;
      Object.assign(document, update.$set);
      return clone();
    }),
  };
  const database = { collection: vi.fn(() => collection) };
  return { database, collection, snapshot: clone };
}

describe("Shopify Admin GraphQL mirror", () => {
  beforeEach(() => {
    process.env.SHOPIFY_STORE_DOMAIN = ["torqbearingsstore", "myshopify", "com"].join(".");
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
    vi.stubGlobal("fetch", vi.fn());
    const { database } = createTokenDatabase();
    mocks.getDatabase.mockResolvedValue(database);
  });

  it("links an exact phone match rather than creating a duplicate", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        customers: {
          nodes: [{ id: "gid://shopify/Customer/10", phone: "+92 300 1234567" }],
        },
      }));

    await expect(ensureShopifyCustomer("+923001234567", "Contact")).resolves.toBe(
      "gid://shopify/Customer/10",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const [oauthUrl, oauthOptions] = vi.mocked(fetch).mock.calls[0];
    expect(String(oauthUrl)).toBe(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    );
    expect(oauthOptions?.body).toBeInstanceOf(URLSearchParams);
    expect(String(oauthOptions?.body)).toContain("grant_type=client_credentials");
    const [graphqlUrl, options] = vi.mocked(fetch).mock.calls[1];
    expect(String(graphqlUrl)).toContain("/admin/api/2026-10/graphql.json");
    expect(options?.headers).toMatchObject({
      "X-Shopify-Access-Token": "server-token-for-test",
    });
  });

  it("creates a customer with only the pending verification tag when no phone match exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({ customers: { nodes: [] } }))
      .mockResolvedValueOnce(graphQLResponse({
        customerCreate: {
          customer: { id: "gid://shopify/Customer/11" },
          userErrors: [],
        },
      }));

    await expect(ensureShopifyCustomer("+923001234567", "Contact Person")).resolves.toBe(
      "gid://shopify/Customer/11",
    );
    const mutation = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
    expect(mutation.variables.input).toEqual({
      phone: "+923001234567",
      firstName: "Contact Person",
      tags: ["pending-verification"],
    });
  });

  it("writes the requested metafield names and multiline types", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        metafieldsSet: { userErrors: [] },
      }));

    await writeShopifyMetafields("gid://shopify/Customer/12", {
      status: "pending",
      syncVersion: 1,
      contactPersonName: "Person",
      shopName: "Shop",
      contactMobileNumber: "+923001234567",
      alternateMobileNumber: "+923001234568",
      shopAddress: "Address",
      detailedAddress: "Street\nArea",
      city: "Lahore",
      province: "Punjab",
      comments: "Line one\nLine two",
    });

    const mutation = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    const fields = mutation.variables.metafields as Array<{ key: string; type: string; namespace: string }>;
    expect(fields.map(({ key }) => key)).toEqual([
      "contact_person_name_1",
      "shop_name",
      "mobile_whatsapp_number",
      "alternate_mobile_number",
      "shop_address",
      "detailed_address",
      "city_name",
      "province",
      "comments",
    ]);
    expect(fields.filter(({ type }) => type === "multi_line_text_field").map(({ key }) => key)).toEqual([
      "detailed_address",
      "comments",
    ]);
    expect(fields.every(({ namespace }) => namespace === "custom")).toBe(true);
  });

  it("deletes cleared optional metafields and never sends blank values", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        metafieldsDelete: { userErrors: [] },
      }))
      .mockResolvedValueOnce(graphQLResponse({
        metafieldsSet: { userErrors: [] },
      }));

    await writeShopifyMetafields("gid://shopify/Customer/12", {
      status: "pending",
      syncVersion: 2,
      contactPersonName: "Person",
      shopName: "Shop",
      contactMobileNumber: "+923001234567",
      alternateMobileNumber: "  ",
      shopAddress: "Address",
      detailedAddress: "Street\nArea",
      city: "Lahore",
      province: "Punjab",
      comments: "",
    });

    const deletion = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(deletion.query).toContain("metafieldsDelete");
    expect(deletion.variables.metafields).toEqual([
      {
        ownerId: "gid://shopify/Customer/12",
        namespace: "custom",
        key: "alternate_mobile_number",
      },
      {
        ownerId: "gid://shopify/Customer/12",
        namespace: "custom",
        key: "comments",
      },
    ]);

    const update = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
    expect(update.query).toContain("metafieldsSet");
    expect(update.variables.metafields.every(({ value }: { value: string }) => value.trim())).toBe(true);
    expect(update.variables.metafields.map(({ key }: { key: string }) => key)).not.toContain(
      "alternate_mobile_number",
    );
    expect(update.variables.metafields.map(({ key }: { key: string }) => key)).not.toContain("comments");
  });

  it("maps active Shopify products and calculates piece price only when configured", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        shop: { currencyCode: "PKR" },
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Product/1",
              title: "6300-2RS",
              handle: "6300-2rs",
              featuredImage: { url: "https://cdn.shopify.com/bearing.jpg", altText: "Bearing" },
              piecesPerCarton: { type: "number_integer", value: "400" },
              variants: {
                nodes: [{
                  id: "gid://shopify/ProductVariant/10",
                  sku: "6300-2RS",
                  price: "22400.00",
                  inventoryQuantity: 7,
                }],
              },
            },
            {
              id: "gid://shopify/Product/2",
              title: "6301",
              handle: "6301",
              featuredImage: null,
              piecesPerCarton: null,
              variants: {
                nodes: [{
                  id: "gid://shopify/ProductVariant/20",
                  sku: null,
                  price: "1000.00",
                  inventoryQuantity: 0,
                }],
              },
            },
          ],
        },
      }));

    await expect(getActiveShopifyProducts()).resolves.toEqual([
      {
        id: "gid://shopify/Product/1",
        variantId: "gid://shopify/ProductVariant/10",
        title: "6300-2RS",
        handle: "6300-2rs",
        imageUrl: "https://cdn.shopify.com/bearing.jpg",
        imageAlt: "Bearing",
        sku: "6300-2RS",
        cartonPrice: 22400,
        pricePerPiece: 56,
        piecesPerCarton: 400,
        inventoryCartons: 7,
      },
      {
        id: "gid://shopify/Product/2",
        variantId: "gid://shopify/ProductVariant/20",
        title: "6301",
        handle: "6301",
        imageUrl: null,
        imageAlt: "6301",
        sku: "",
        cartonPrice: 1000,
        pricePerPiece: null,
        piecesPerCarton: null,
        inventoryCartons: 0,
      },
    ]);
    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(requestBody.query).toContain('query: "status:active"');
    expect(requestBody.query).toContain("shop {\n    currencyCode");
    expect(requestBody.query).toContain("          price\n");
    expect(requestBody.query).not.toContain("price { amount currencyCode }");
    expect(requestBody.query).toContain("inventoryQuantity");
    expect(requestBody.query).toContain('key: "pieces_per_carton"');
  });

  it("re-loads checkout prices and carton inventory from Shopify", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        shop: { currencyCode: "PKR" },
        nodes: [{
          id: "gid://shopify/ProductVariant/42",
          title: "Default",
          sku: "6302-2RS",
          price: "37200.00",
          inventoryQuantity: 4,
          availableForSale: true,
          product: { title: "6302-2RS", status: "ACTIVE" },
        }],
      }));

    await expect(getShopifyCheckoutVariants(["gid://shopify/ProductVariant/42"])).resolves.toEqual({
      currencyCode: "PKR",
      variants: [{
        variantId: "gid://shopify/ProductVariant/42",
        title: "6302-2RS",
        sku: "6302-2RS",
        unitPrice: 37200,
        inventoryQuantity: 4,
        availableForSale: true,
      }],
    });
    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(requestBody.variables).toEqual({ ids: ["gid://shopify/ProductVariant/42"] });
    expect(requestBody.query).toContain("inventoryQuantity");
    expect(requestBody.query).toContain("availableForSale");
  });

  it("creates a tagged customer draft order with the portal checkout key and shipping address", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        draftOrderCreate: {
          draftOrder: { id: "gid://shopify/DraftOrder/90" },
          userErrors: [],
        },
      }));

    await expect(createShopifyPortalDraftOrder({
      customerId: "gid://shopify/Customer/42",
      checkoutKey: "11111111-1111-4111-8111-111111111111",
      address: {
        contactPersonName: "Jane Doe",
        shopName: "Bearing House",
        phone: "+923001234567",
        shopAddress: "Shop 4",
        detailedAddress: "Market Road",
        city: "Lahore",
        province: "Punjab",
      },
      items: [{ variantId: "gid://shopify/ProductVariant/42", quantity: 3 }],
    })).resolves.toBe("gid://shopify/DraftOrder/90");

    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(requestBody.query).toContain("draftOrderCreate");
    expect(requestBody.variables.input).toMatchObject({
      purchasingEntity: { customerId: "gid://shopify/Customer/42" },
      lineItems: [{ variantId: "gid://shopify/ProductVariant/42", quantity: 3 }],
      tags: ["torq-portal"],
      note: "Shop: Bearing House\nMobile: +923001234567",
      shippingAddress: {
        firstName: "Jane",
        lastName: "Doe",
        company: "Bearing House",
        address1: "Shop 4",
        address2: "Market Road",
        city: "Lahore",
        provinceCode: "PK-PB",
        countryCode: "PK",
        phone: "+923001234567",
      },
      customAttributes: [{
        key: "torq_checkout_key",
        value: "11111111-1111-4111-8111-111111111111",
      }],
    });
    expect(JSON.stringify(requestBody.variables)).not.toContain("unitPrice");
  });

  it("completes a draft order with payment pending and returns the Shopify total", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        draftOrderComplete: {
          draftOrder: {
            order: {
              id: "gid://shopify/Order/100",
              name: "#100",
              currentTotalPriceSet: { shopMoney: { amount: "111600.00", currencyCode: "PKR" } },
            },
          },
          userErrors: [],
        },
      }));

    await expect(completeShopifyPortalDraftOrder("gid://shopify/DraftOrder/90")).resolves.toEqual({
      orderId: "gid://shopify/Order/100",
      orderName: "#100",
      totalPrice: 111600,
      currencyCode: "PKR",
    });
    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(requestBody.query).toContain("paymentPending: true");
    expect(requestBody.variables).toEqual({ id: "gid://shopify/DraftOrder/90" });
  });

  it("finds an order with the checkout idempotency key before retrying a write", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        draftOrders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      }))
      .mockResolvedValueOnce(graphQLResponse({
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{
            id: "gid://shopify/Order/100",
            name: "#100",
            customAttributes: [{
              key: "torq_checkout_key",
              value: "11111111-1111-4111-8111-111111111111",
            }],
            currentTotalPriceSet: { shopMoney: { amount: "111600.00", currencyCode: "PKR" } },
          }],
        },
      }));

    await expect(findShopifyPortalCheckout(
      "gid://shopify/Customer/42",
      "11111111-1111-4111-8111-111111111111",
      new Date("2026-11-17T09:00:00.000Z"),
    )).resolves.toEqual({
      draftOrderId: "",
      order: {
        orderId: "gid://shopify/Order/100",
        orderName: "#100",
        totalPrice: 111600,
        currencyCode: "PKR",
      },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it("removes only the three status tags and preserves all other customer tags", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockResolvedValueOnce(graphQLResponse({
        tagsRemove: { userErrors: [] },
        tagsAdd: { userErrors: [] },
      }));

    await writeShopifyStatusTags(
      "gid://shopify/Customer/13",
      "approved",
      ["vip", "wholesale", "blocked", "pending-verification"],
    );
    const mutation = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(mutation.query).toContain("tagsRemove");
    expect(mutation.query).toContain("tagsAdd");
    expect(mutation.variables).toEqual({
      id: "gid://shopify/Customer/13",
      tagsToRemove: ["pending-verification", "blocked"],
      tagsToAdd: ["approved"],
    });
  });

  it("caches the encrypted access token across API calls using its expiry", async () => {
    const tokenDatabase = createTokenDatabase();
    mocks.getDatabase.mockResolvedValue(tokenDatabase.database);
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse("cached-token"))
      .mockResolvedValueOnce(graphQLResponse({
        customers: { nodes: [{ id: "gid://shopify/Customer/10", phone: "+923001234567" }] },
      }))
      .mockResolvedValueOnce(graphQLResponse({
        customers: { nodes: [{ id: "gid://shopify/Customer/11", phone: "+923001234568" }] },
      }));

    await ensureShopifyCustomer("+923001234567", "Contact");
    await ensureShopifyCustomer("+923001234568", "Contact");

    expect(fetch).toHaveBeenCalledTimes(3);
    const stored = JSON.stringify(tokenDatabase.snapshot());
    expect(stored).not.toContain("cached-token");
    expect(stored).not.toContain("test-client-secret");
  });

  it("refreshes the cached token before its short expiry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse("short-lived-token", 1))
      .mockResolvedValueOnce(graphQLResponse({
        customers: { nodes: [{ id: "gid://shopify/Customer/10", phone: "+923001234567" }] },
      }))
      .mockResolvedValueOnce(oauthResponse("refreshed-token", 3600))
      .mockResolvedValueOnce(graphQLResponse({
        customers: { nodes: [{ id: "gid://shopify/Customer/11", phone: "+923001234568" }] },
      }));

    await ensureShopifyCustomer("+923001234567", "Contact");
    await ensureShopifyCustomer("+923001234568", "Contact");

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("/admin/oauth/access_token");
  });

  it("refreshes and retries exactly once after a Shopify 401", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse("expired-token"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(oauthResponse("replacement-token"))
      .mockResolvedValueOnce(graphQLResponse({
        customers: {
          nodes: [{ id: "gid://shopify/Customer/10", phone: "+923001234567" }],
        },
      }));

    await expect(ensureShopifyCustomer("+923001234567", "Contact")).resolves.toBe(
      "gid://shopify/Customer/10",
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({
      "X-Shopify-Access-Token": "expired-token",
    });
    expect(vi.mocked(fetch).mock.calls[3][1]?.headers).toMatchObject({
      "X-Shopify-Access-Token": "replacement-token",
    });
  });

  it("does not retry a write when its completion is ambiguous", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(oauthResponse())
      .mockRejectedValueOnce(new Error("connection interrupted"));

    await expect(
      writeShopifyMetafields("gid://shopify/Customer/12", {
        status: "pending",
        syncVersion: 1,
      }),
    ).rejects.toThrow("Shopify Admin API request failed.");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails safely when credentials are missing or the token endpoint errors", async () => {
    delete process.env.SHOPIFY_CLIENT_SECRET;
    await expect(ensureShopifyCustomer("+923001234567", "Contact")).rejects.toThrow(
      "Shopify Admin API credentials are not configured.",
    );
    expect(fetch).not.toHaveBeenCalled();

    process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(ensureShopifyCustomer("+923001234567", "Contact")).rejects.toThrow(
      "Shopify authentication failed with HTTP 500.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry the token request after a timeout", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

    await expect(ensureShopifyCustomer("+923001234567", "Contact")).rejects.toThrow(
      "Shopify authentication request timed out.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
