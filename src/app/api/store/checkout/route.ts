import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ObjectId, type Collection } from "mongodb";
import { getSession } from "@/lib/auth";
import {
  getDatabase,
  isDatabaseConfigured,
  type CustomerDocument,
  type ShopifyOrderDocument,
} from "@/lib/db";
import { badOrigin, isSameOrigin, readJson } from "@/lib/http";
import {
  completeShopifyPortalDraftOrder,
  createShopifyPortalDraftOrder,
  findShopifyPortalCheckout,
  getShopifyCheckoutVariants,
  getShopifyPortalDraftOrder,
  ShopifyOperationError,
  type ShopifyCheckoutVariant,
  type ShopifyCreatedOrder,
  type ShopifyOrderLineItem,
  type ShopifyRequestOptions,
} from "@/lib/shopify";

const LEASE_MS = 30_000;
const SHOPIFY_CHECKOUT_TIMEOUT_MS = 20_000;
const MAX_CART_LINES = 100;
const CHECKOUT_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutLine = { variantId: string; quantity: number };

class CheckoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function parseCheckout(body: Record<string, unknown>): {
  checkoutKey: string;
  items: CheckoutLine[];
} {
  if (
    Object.keys(body).some((key) => key !== "checkoutKey" && key !== "items") ||
    typeof body.checkoutKey !== "string" ||
    !CHECKOUT_KEY_PATTERN.test(body.checkoutKey) ||
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > MAX_CART_LINES
  ) {
    throw new CheckoutError("Your cart could not be checked out. Please review it and try again.", 400);
  }

  const items: CheckoutLine[] = [];
  const seenVariants = new Set<string>();
  for (const rawItem of body.items) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem) ||
      Object.keys(rawItem).some((key) => key !== "variantId" && key !== "quantity")
    ) {
      throw new CheckoutError("Your cart contains an invalid item.", 400);
    }
    const item = rawItem as Record<string, unknown>;
    if (
      typeof item.variantId !== "string" ||
      !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(item.variantId) ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) < 1 ||
      (item.quantity as number) > 100_000 ||
      seenVariants.has(item.variantId)
    ) {
      throw new CheckoutError("Your cart contains an invalid product or carton quantity.", 400);
    }
    seenVariants.add(item.variantId);
    items.push({ variantId: item.variantId, quantity: item.quantity as number });
  }
  return { checkoutKey: body.checkoutKey, items };
}

function hashItems(items: CheckoutLine[]): string {
  const canonical = [...items]
    .sort((left, right) => left.variantId.localeCompare(right.variantId))
    .map(({ variantId, quantity }) => `${variantId}:${quantity}`)
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function getCompletedResponse(order: ShopifyOrderDocument) {
  return {
    orderName: order.orderName,
    totalCartons: order.totalCartons,
    totalPrice: order.totalPrice,
    currencyCode: order.currencyCode,
  };
}

function shopifyScopeError(error: unknown): NextResponse | null {
  if (!(error instanceof ShopifyOperationError)) return null;
  if (error.requiredScope) {
    return NextResponse.json(
      { error: `Shopify setup is missing the required Admin API scope: ${error.requiredScope}.` },
      { status: 503 },
    );
  }
  return null;
}

async function saveCompletedOrder(
  orders: Collection<ShopifyOrderDocument>,
  intent: ShopifyOrderDocument,
  leaseId: string,
  order: ShopifyCreatedOrder,
  lineItems: ShopifyOrderLineItem[],
  totalCartons: number,
  now: Date,
) {
  const update = await orders.updateOne(
    { _id: intent._id, leaseId },
    {
      $set: {
        state: "completed",
        shopifyOrderId: order.orderId,
        orderName: order.orderName,
        items: lineItems,
        totalCartons,
        totalPrice: order.totalPrice,
        currencyCode: order.currencyCode,
        updatedAt: now,
        completedAt: now,
      },
      $unset: { leaseId: "", leaseUntil: "" },
    },
  );
  if (update.matchedCount !== 1) {
    throw new Error("Checkout reservation was lost before order details were saved.");
  }
  return {
    orderName: order.orderName,
    totalCartons,
    totalPrice: order.totalPrice,
    currencyCode: order.currencyCode,
  };
}

function buildLineItems(
  items: CheckoutLine[],
  variants: ShopifyCheckoutVariant[],
): ShopifyOrderLineItem[] {
  const byId = new Map(variants.map((variant) => [variant.variantId, variant]));
  return items.map(({ variantId, quantity }) => {
    const variant = byId.get(variantId);
    if (!variant) {
      throw new CheckoutError("A product in your cart is no longer available.", 409);
    }
    if (!variant.availableForSale) {
      throw new CheckoutError(`${variant.title} is no longer available for sale.`, 409);
    }
    if (quantity > variant.inventoryQuantity) {
      throw new CheckoutError(
        `${variant.title} has only ${variant.inventoryQuantity} carton(s) available. Please update your cart.`,
        409,
      );
    }
    return {
      variantId,
      quantity,
      title: variant.title,
      sku: variant.sku,
      unitPrice: variant.unitPrice,
    };
  });
}

async function claimCheckout(
  orders: Collection<ShopifyOrderDocument>,
  id: string,
  customerId: ObjectId,
  checkoutKey: string,
  payloadHash: string,
  now: Date,
): Promise<{ intent: ShopifyOrderDocument; leaseId: string; previous: ShopifyOrderDocument | null }> {
  const existing = await orders.findOne({ _id: id }) as ShopifyOrderDocument | null;
  if (existing && (!existing.customerId.equals(customerId) || existing.checkoutKey !== checkoutKey)) {
    throw new CheckoutError("This checkout key is not valid for this account.", 409);
  }
  if (existing && existing.payloadHash !== payloadHash) {
    throw new CheckoutError("Your cart changed. Please start checkout again.", 409);
  }
  if (existing?.state === "completed") {
    throw new CheckoutError("ORDER_ALREADY_COMPLETED", 200);
  }
  if (existing?.leaseUntil && existing.leaseUntil > now) {
    throw new CheckoutError("An order for this cart is already being processed. Please wait.", 409);
  }

  const leaseId = randomUUID();
  if (!existing) {
    const intent: ShopifyOrderDocument = {
      _id: id,
      customerId,
      checkoutKey,
      payloadHash,
      state: "processing",
      createAttempted: false,
      leaseId,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await orders.insertOne(intent);
      return { intent, leaseId, previous: null };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
        throw error;
      }
    }
  }

  const previous = existing ?? await orders.findOne({ _id: id }) as ShopifyOrderDocument | null;
  if (!previous) throw new Error("Checkout reservation could not be loaded.");
  if (previous.state === "completed") throw new CheckoutError("ORDER_ALREADY_COMPLETED", 200);
  if (previous.leaseUntil && previous.leaseUntil > now) {
    throw new CheckoutError("An order for this cart is already being processed. Please wait.", 409);
  }

  const claimed = await orders.findOneAndUpdate(
    {
      _id: id,
      payloadHash,
      state: { $ne: "completed" },
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        state: "processing",
        leaseId,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  ) as ShopifyOrderDocument | null;
  if (!claimed) {
    throw new CheckoutError("An order for this cart is already being processed. Please wait.", 409);
  }
  return { intent: claimed, leaseId, previous };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return badOrigin();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Order service is temporarily unavailable." }, { status: 503 });
  }
  const session = await getSession();
  if (session?.role !== "customer" || !session.customerId || !ObjectId.isValid(session.customerId)) {
    return NextResponse.json({ error: "Sign in with an approved customer account to place an order." }, { status: 401 });
  }
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Submit a valid checkout request." }, { status: 400 });

  let checkout: ReturnType<typeof parseCheckout>;
  try {
    checkout = parseCheckout(body);
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let intent: ShopifyOrderDocument | undefined;
  let leaseId: string | undefined;
  const now = new Date();
  try {
    const database = await getDatabase();
    const customerId = new ObjectId(session.customerId);
    const customer = await database.collection<CustomerDocument>("customers").findOne({
      _id: customerId,
      "shop_details.status": "approved",
      "shop_details.completedAt": { $exists: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Only approved customers with completed shop details can place orders." }, { status: 403 });
    }
    if (!customer.shopifyCustomerId) {
      return NextResponse.json({ error: "Your Shopify customer profile is not synced yet. Please try again shortly." }, { status: 409 });
    }
    const details = customer.shop_details;
    if (
      !details.contactPersonName ||
      !details.shopName ||
      !details.contactMobileNumber ||
      !details.shopAddress ||
      !details.detailedAddress ||
      !details.city ||
      !details.province
    ) {
      return NextResponse.json({ error: "Complete your shop details before placing an order." }, { status: 409 });
    }

    const orderCollection = database.collection<ShopifyOrderDocument>("shopify_orders");
    const shopifyOptions: ShopifyRequestOptions = {
      deadlineAt: Date.now() + SHOPIFY_CHECKOUT_TIMEOUT_MS,
    };
    const intentId = `${customerId.toString()}:${checkout.checkoutKey}`;
    const payloadHash = hashItems(checkout.items);
    const previousIntent = await orderCollection.findOne({ _id: intentId }) as ShopifyOrderDocument | null;
    if (previousIntent) {
      if (!previousIntent.customerId.equals(customerId) || previousIntent.checkoutKey !== checkout.checkoutKey) {
        return NextResponse.json({ error: "This checkout key is not valid for this account." }, { status: 409 });
      }
      if (previousIntent.payloadHash !== payloadHash) {
        return NextResponse.json({ error: "Your cart changed. Please start checkout again." }, { status: 409 });
      }
      if (previousIntent.state === "completed") {
        return NextResponse.json({ order: getCompletedResponse(previousIntent) }, { status: 200 });
      }
    }

    const { variants, currencyCode } = await getShopifyCheckoutVariants(
      checkout.items.map(({ variantId }) => variantId),
      shopifyOptions,
    );
    if (currencyCode !== "PKR") {
      return NextResponse.json({ error: "Orders are temporarily unavailable because the store currency is not PKR." }, { status: 503 });
    }
    const lineItems = buildLineItems(checkout.items, variants);
    const totalCartons = lineItems.reduce((sum, item) => sum + item.quantity, 0);
    let claimed;
    try {
      claimed = await claimCheckout(
        orderCollection,
        intentId,
        customerId,
        checkout.checkoutKey,
        payloadHash,
        now,
      );
    } catch (error) {
      if (error instanceof CheckoutError && error.message === "ORDER_ALREADY_COMPLETED") {
        const completed = await orderCollection.findOne({ _id: intentId }) as ShopifyOrderDocument | null;
        if (completed) {
          return NextResponse.json({ order: getCompletedResponse(completed) }, { status: 200 });
        }
      }
      throw error;
    }
    intent = claimed.intent;
    leaseId = claimed.leaseId;

    let draftOrderId = intent.draftOrderId;
    let createdOrder: ShopifyCreatedOrder | null = null;
    const priorWriteMayHaveHappened =
      claimed.previous?.createAttempted === true ||
      claimed.previous?.state === "uncertain";

    if (draftOrderId) {
      createdOrder = await getShopifyPortalDraftOrder(draftOrderId, shopifyOptions);
    } else if (priorWriteMayHaveHappened) {
      const match = await findShopifyPortalCheckout(
        customer.shopifyCustomerId,
        checkout.checkoutKey,
        intent.createdAt,
        shopifyOptions,
      );
      if (!match) {
        await orderCollection.updateOne(
          { _id: intent._id, leaseId },
          {
            $set: { state: "uncertain", updatedAt: new Date() },
            $unset: { leaseId: "", leaseUntil: "" },
          },
        );
        return NextResponse.json(
          { error: "We couldn't confirm whether Shopify received this order. Your cart is safe; contact support before starting a new checkout." },
          { status: 502 },
        );
      }
      draftOrderId = match.draftOrderId || undefined;
      createdOrder = match.order;
      if (draftOrderId) {
        await orderCollection.updateOne(
          { _id: intent._id, leaseId },
          { $set: { draftOrderId, updatedAt: new Date() } },
        );
        intent.draftOrderId = draftOrderId;
      }
    } else {
      await orderCollection.updateOne(
        { _id: intent._id, leaseId },
        { $set: { createAttempted: true, items: lineItems, totalCartons, updatedAt: new Date() } },
      );
      intent.createAttempted = true;
      intent.items = lineItems;
      intent.totalCartons = totalCartons;
      try {
        draftOrderId = await createShopifyPortalDraftOrder({
          customerId: customer.shopifyCustomerId,
          checkoutKey: checkout.checkoutKey,
          address: {
            contactPersonName: details.contactPersonName,
            shopName: details.shopName,
            phone: details.contactMobileNumber,
            shopAddress: details.shopAddress,
            detailedAddress: details.detailedAddress,
            city: details.city,
            province: details.province,
          },
          items: checkout.items,
        }, shopifyOptions);
        await orderCollection.updateOne(
          { _id: intent._id, leaseId },
          { $set: { draftOrderId, updatedAt: new Date() } },
        );
        intent.draftOrderId = draftOrderId;
      } catch (error) {
        if (!(error instanceof ShopifyOperationError) || !error.outcomeUnknown) {
          await orderCollection.updateOne(
            { _id: intent._id, leaseId },
            {
              $set: { state: "failed", createAttempted: false, updatedAt: new Date() },
              $unset: { leaseId: "", leaseUntil: "" },
            },
          );
          intent.createAttempted = false;
          throw error;
        }
        const match = await findShopifyPortalCheckout(
          customer.shopifyCustomerId,
          checkout.checkoutKey,
          intent.createdAt,
          shopifyOptions,
        );
        if (!match) {
          await orderCollection.updateOne(
            { _id: intent._id, leaseId },
            {
              $set: { state: "uncertain", updatedAt: new Date() },
              $unset: { leaseId: "", leaseUntil: "" },
            },
          );
          return NextResponse.json(
            { error: "We couldn't confirm whether Shopify received this order. Your cart is safe; contact support before starting a new checkout." },
            { status: 502 },
          );
        }
        draftOrderId = match.draftOrderId || undefined;
        createdOrder = match.order;
        if (draftOrderId) {
          await orderCollection.updateOne(
            { _id: intent._id, leaseId },
            { $set: { draftOrderId, updatedAt: new Date() } },
          );
          intent.draftOrderId = draftOrderId;
        }
      }
    }

    if (!createdOrder && draftOrderId) {
      try {
        createdOrder = await completeShopifyPortalDraftOrder(draftOrderId, shopifyOptions);
      } catch (error) {
        if (!(error instanceof ShopifyOperationError) || !error.outcomeUnknown) throw error;
        createdOrder = await getShopifyPortalDraftOrder(draftOrderId, shopifyOptions);
        if (!createdOrder) {
          await orderCollection.updateOne(
            { _id: intent._id, leaseId },
            {
              $set: { state: "uncertain", updatedAt: new Date() },
              $unset: { leaseId: "", leaseUntil: "" },
            },
          );
          return NextResponse.json(
            { error: "We couldn't confirm whether Shopify completed this order. Your cart is safe; contact support before starting a new checkout." },
            { status: 502 },
          );
        }
      }
    }

    if (!createdOrder) {
      throw new Error("Shopify order completion could not be confirmed.");
    }
    if (createdOrder.currencyCode !== "PKR") {
      throw new Error("Shopify returned an unexpected order currency.");
    }
    const response = await saveCompletedOrder(
      orderCollection,
      intent,
      leaseId,
      createdOrder,
      lineItems,
      totalCartons,
      new Date(),
    );
    return NextResponse.json({ order: response }, { status: 201 });
  } catch (error) {
    if (intent && leaseId) {
      const scopeResponse = shopifyScopeError(error);
      const outcomeUnknown =
        error instanceof ShopifyOperationError && error.outcomeUnknown;
      const unresolvedCreate = intent.createAttempted && !intent.draftOrderId;
      await getDatabase().then((database) =>
        database.collection<ShopifyOrderDocument>("shopify_orders").updateOne(
          { _id: intent!._id, leaseId },
          {
            $set: {
              state: outcomeUnknown || unresolvedCreate
                ? "uncertain"
                : "failed",
              createAttempted: intent!.createAttempted,
              updatedAt: new Date(),
            },
            $unset: { leaseId: "", leaseUntil: "" },
          },
        ),
      );
      console.error("Shopify checkout failed.");
      if (scopeResponse) return scopeResponse;
      if (error instanceof CheckoutError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        {
          error: error instanceof ShopifyOperationError && error.outcomeUnknown
            ? "We couldn't confirm the order with Shopify. Your cart is safe; contact support before trying again."
            : "Shopify could not complete this order. Your cart has been kept.",
        },
        { status: 502 },
      );
    }
    if (error instanceof ShopifyOperationError) {
      const scopeResponse = shopifyScopeError(error);
      if (scopeResponse) return scopeResponse;
      console.error("Shopify checkout validation failed.");
      return NextResponse.json(
        { error: "Shopify could not validate the current products. Your cart has been kept." },
        { status: 502 },
      );
    }
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Shopify checkout failed.");
    return NextResponse.json(
      { error: "We couldn't complete the order. Your cart has been kept." },
      { status: 502 },
    );
  }
}
