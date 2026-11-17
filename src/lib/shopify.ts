import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { hasShopifyStatusTag, shopifyStatusTag, SHOPIFY_STATUS_TAGS } from "./verification";
import { getDatabase } from "./db";
import type { AccountStatus, CustomerDocument } from "./db";

const API_VERSION = "2026-10";
const TOKEN_CACHE_ID = "shopify-admin-access-token";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const TOKEN_REFRESH_LEASE_MS = 20_000;
const TOKEN_REFRESH_WAIT_MS = 12_000;
const OAUTH_TIMEOUT_MS = 8_000;
const TOKEN_POLL_INTERVAL_MS = 100;
const STATUS_QUERY = `query CustomerStatusTags($id: ID!) {
  customer(id: $id) { id tags }
}`;
const UPDATE_TAGS_MUTATION = `mutation UpdateCustomerStatusTags(
  $id: ID!,
  $tagsToRemove: [String!]!,
  $tagsToAdd: [String!]!
) {
  tagsRemove(id: $id, tags: $tagsToRemove) {
    userErrors { field message }
  }
  tagsAdd(id: $id, tags: $tagsToAdd) {
    userErrors { field message }
  }
}`;
const FIND_CUSTOMERS_QUERY = `query FindCustomersByPhone($query: String!) {
  customers(first: 50, query: $query) {
    nodes { id phone }
  }
}`;
const CREATE_CUSTOMER_MUTATION = `mutation CreateCustomer($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id phone }
    userErrors { field message }
  }
}`;
const SET_METAFIELDS_MUTATION = `mutation SetCustomerMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    userErrors { field message }
  }
}`;
const DELETE_METAFIELDS_MUTATION = `mutation DeleteCustomerMetafields($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    userErrors { field message }
  }
}`;
const ACTIVE_PRODUCTS_QUERY = `query ActiveStoreProducts($after: String) {
  shop {
    currencyCode
  }
  products(first: 100, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      featuredImage { url altText }
      piecesPerCarton: metafield(namespace: "custom", key: "pieces_per_carton") {
        type
        value
      }
      variants(first: 1) {
        nodes {
          id
          sku
          price
          inventoryQuantity
        }
      }
    }
  }
}`;
const CHECKOUT_VARIANTS_QUERY = `query CheckoutVariants($ids: [ID!]!) {
  shop { currencyCode }
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      sku
      price
      inventoryQuantity
      availableForSale
      product { title status }
    }
  }
}`;
const CREATE_DRAFT_ORDER_MUTATION = `mutation CreatePortalDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      createdAt
    }
    userErrors { field message }
  }
}`;
const COMPLETE_DRAFT_ORDER_MUTATION = `mutation CompletePortalDraftOrder($id: ID!) {
  draftOrderComplete(id: $id, paymentPending: true) {
    draftOrder {
      id
      order {
        id
        name
        currentTotalPriceSet { shopMoney { amount currencyCode } }
      }
    }
    userErrors { field message }
  }
}`;
const FIND_PORTAL_DRAFT_ORDERS_QUERY = `query FindPortalDraftOrders($after: String, $query: String!) {
  draftOrders(first: 100, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      customAttributes { key value }
      order {
        id
        name
        currentTotalPriceSet { shopMoney { amount currencyCode } }
      }
    }
  }
}`;
const FIND_PORTAL_ORDERS_QUERY = `query FindPortalOrders($after: String, $query: String!) {
  orders(first: 100, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      customAttributes { key value }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}`;

type GraphQLError = { message: string };
type UserError = { field: string[] | null; message: string };

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

type CheckoutVariantResponse = {
  shop: { currencyCode: string };
  nodes: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    inventoryQuantity: number;
    availableForSale: boolean;
    product: { title: string; status: string };
  } | null>;
};

type ShopifyOrderMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyOrderLookup = {
  id: string;
  name: string;
  currentTotalPriceSet: { shopMoney: ShopifyOrderMoney };
};

type ShopifyDraftLookupResponse = {
  draftOrders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      customAttributes: Array<{ key: string; value: string }>;
      order: ShopifyOrderLookup | null;
    }>;
  };
};

type ShopifyOrderLookupResponse = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      name: string;
      customAttributes: Array<{ key: string; value: string }>;
      currentTotalPriceSet: { shopMoney: ShopifyOrderMoney };
    }>;
  };
};

export class ShopifyOperationError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown = false,
    readonly requiredScope?: string,
  ) {
    super(message);
    this.name = "ShopifyOperationError";
  }
}

type ShopifyTokenCacheDocument = {
  _id: string;
  token?: {
    ciphertext: string;
    iv: string;
    authTag: string;
    fingerprint: string;
  };
  expiresAt?: Date;
  refreshAt?: Date;
  refreshLeaseId?: string;
  refreshLeaseUntil?: Date;
};

type ShopifyCredentials = {
  domain: string;
  clientId: string;
  clientSecret: string;
};

type ActiveProductsResponse = {
  shop: {
    currencyCode: string;
  };
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      title: string;
      handle: string;
      featuredImage: { url: string; altText: string | null } | null;
      piecesPerCarton: { type: string; value: string } | null;
      variants: {
        nodes: Array<{
          id: string;
          sku: string | null;
          price: string;
          inventoryQuantity: number;
        }>;
      };
    }>;
  };
};

export type ShopifyRequestOptions = {
  deadlineAt?: number;
};

export type ShopifyStoreProduct = {
  id: string;
  variantId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string;
  sku: string;
  cartonPrice: number | null;
  pricePerPiece: number | null;
  piecesPerCarton: number | null;
  inventoryCartons: number;
};

export type ShopifyCheckoutVariant = {
  variantId: string;
  title: string;
  sku: string;
  unitPrice: number;
  inventoryQuantity: number;
  availableForSale: boolean;
};

export type ShopifyOrderAddress = {
  contactPersonName: string;
  shopName: string;
  phone: string;
  shopAddress: string;
  detailedAddress: string;
  city: string;
  province: string;
};

export type ShopifyOrderLineItem = {
  variantId: string;
  quantity: number;
  title: string;
  sku: string;
  unitPrice: number;
};

export type ShopifyCreatedOrder = {
  orderId: string;
  orderName: string;
  totalPrice: number;
  currencyCode: string;
};

type CustomerDetails = NonNullable<CustomerDocument["shop_details"]>;

let nextCallAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

function getShopifyCredentials(): ShopifyCredentials {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new Error("Shopify Admin API credentials are not configured.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("SHOPIFY_STORE_DOMAIN must be a Shopify .myshopify.com domain.");
  }
  return { domain, clientId, clientSecret };
}

function deriveTokenKeys(credentials: ShopifyCredentials): {
  encryptionKey: Buffer;
  fingerprintKey: Buffer;
} {
  const keyMaterial = Buffer.from(
    hkdfSync(
      "sha256",
      credentials.clientSecret,
      `shopify-token-cache:${credentials.domain}`,
      "admin-access-token-v1",
      64,
    ),
  );
  return {
    encryptionKey: keyMaterial.subarray(0, 32),
    fingerprintKey: keyMaterial.subarray(32),
  };
}

function encryptToken(
  token: string,
  key: Buffer,
): NonNullable<ShopifyTokenCacheDocument["token"]> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    fingerprint: "",
  };
}

function fingerprintToken(token: string, key: Buffer): string {
  return createHmac("sha256", key).update(token).digest("hex");
}

function decryptToken(
  token: ShopifyTokenCacheDocument["token"],
  key: Buffer,
): string | null {
  if (!token) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(token.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(token.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(token.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function requestAccessToken(
  credentials: ShopifyCredentials,
  options: ShopifyRequestOptions = {},
): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const remaining = options.deadlineAt === undefined
    ? OAUTH_TIMEOUT_MS
    : Math.min(OAUTH_TIMEOUT_MS, options.deadlineAt - Date.now());
  if (remaining <= 0) throw new Error("Shopify sync attempt timed out.");

  let response: Response;
  try {
    response = await fetch(`https://${credentials.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
      signal: AbortSignal.timeout(remaining),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Shopify authentication request timed out.");
    }
    throw new Error("Shopify authentication request failed.");
  }
  if (!response.ok) {
    throw new Error(`Shopify authentication failed with HTTP ${response.status}.`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Shopify authentication returned an invalid response.");
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("access_token" in result) ||
    typeof result.access_token !== "string" ||
    result.access_token.length === 0 ||
    !("expires_in" in result) ||
    typeof result.expires_in !== "number" ||
    !Number.isSafeInteger(result.expires_in) ||
    result.expires_in <= 0
  ) {
    throw new Error("Shopify authentication returned an invalid response.");
  }
  return {
    accessToken: result.access_token,
    expiresInSeconds: result.expires_in,
  };
}

async function getAccessToken(
  credentials: ShopifyCredentials,
  options: ShopifyRequestOptions = {},
): Promise<string> {
  const database = await getDatabase();
  const tokenCache = database.collection<ShopifyTokenCacheDocument>("shopify_auth_tokens");
  await tokenCache.updateOne(
    { _id: TOKEN_CACHE_ID },
    { $setOnInsert: { _id: TOKEN_CACHE_ID } },
    { upsert: true },
  );
  const { encryptionKey, fingerprintKey } = deriveTokenKeys(credentials);
  const deadline = Math.min(
    Date.now() + TOKEN_REFRESH_WAIT_MS,
    options.deadlineAt ?? Number.POSITIVE_INFINITY,
  );

  while (Date.now() <= deadline) {
    const cached = await tokenCache.findOne({ _id: TOKEN_CACHE_ID });
    if (cached?.refreshAt && cached.refreshAt.getTime() > Date.now()) {
      const accessToken = decryptToken(cached.token, encryptionKey);
      if (accessToken) return accessToken;
    }

    const refreshLeaseId = randomUUID();
    const lease = await tokenCache.findOneAndUpdate(
      {
        _id: TOKEN_CACHE_ID,
        $or: [
          { refreshLeaseUntil: { $exists: false } },
          { refreshLeaseUntil: { $lte: new Date() } },
        ],
      },
      {
        $set: {
          refreshLeaseId,
          refreshLeaseUntil: new Date(Date.now() + TOKEN_REFRESH_LEASE_MS),
        },
      },
      { returnDocument: "after" },
    );
    if (lease?.refreshLeaseId === refreshLeaseId) {
      try {
        const freshToken = await requestAccessToken(credentials, options);
        const now = Date.now();
        const expiresAt = new Date(now + freshToken.expiresInSeconds * 1000);
        const refreshSkew = Math.min(
          TOKEN_REFRESH_SKEW_MS,
          Math.max(1_000, freshToken.expiresInSeconds * 100),
        );
        const encrypted = encryptToken(freshToken.accessToken, encryptionKey);
        encrypted.fingerprint = fingerprintToken(freshToken.accessToken, fingerprintKey);
        await tokenCache.updateOne(
          { _id: TOKEN_CACHE_ID, refreshLeaseId },
          {
            $set: {
              token: encrypted,
              expiresAt,
              refreshAt: new Date(expiresAt.getTime() - refreshSkew),
            },
            $unset: { refreshLeaseId: "", refreshLeaseUntil: "" },
          },
        );
        return freshToken.accessToken;
      } catch (error) {
        await tokenCache.updateOne(
          { _id: TOKEN_CACHE_ID, refreshLeaseId },
          { $unset: { refreshLeaseId: "", refreshLeaseUntil: "" } },
        );
        throw error;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(TOKEN_POLL_INTERVAL_MS, remaining)),
    );
  }
  if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
    throw new Error("Shopify sync attempt timed out.");
  }
  throw new Error("Shopify authentication is already being refreshed. Please retry shortly.");
}

async function invalidateAccessToken(
  credentials: ShopifyCredentials,
  accessToken: string,
): Promise<void> {
  const { fingerprintKey } = deriveTokenKeys(credentials);
  const database = await getDatabase();
  await database.collection<ShopifyTokenCacheDocument>("shopify_auth_tokens").updateOne(
    {
      _id: TOKEN_CACHE_ID,
      "token.fingerprint": fingerprintToken(accessToken, fingerprintKey),
    },
    { $unset: { token: "", expiresAt: "", refreshAt: "" } },
  );
}

async function sendGraphQLRequest(
  domain: string,
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
  options: ShopifyRequestOptions = {},
): Promise<Response> {
  const remaining = options.deadlineAt === undefined
    ? 12000
    : Math.min(12000, options.deadlineAt - Date.now());
  if (remaining <= 0) throw new Error("Shopify sync attempt timed out.");
  return fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(remaining),
    cache: "no-store",
  });
}

async function graphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  options: ShopifyRequestOptions = {},
): Promise<T> {
  const credentials = getShopifyCredentials();
  const isMutation = /^\s*mutation\b/.test(query);
  let requestStarted = false;

  const previousRequest = requestQueue;
  let releaseRequest: () => void = () => {};
  requestQueue = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await previousRequest;
  try {
    const waitMilliseconds = Math.max(0, nextCallAt - Date.now());
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      throw new Error("Shopify sync attempt timed out.");
    }
    if (waitMilliseconds) {
      const boundedWait = options.deadlineAt === undefined
        ? waitMilliseconds
        : Math.min(waitMilliseconds, options.deadlineAt - Date.now());
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, boundedWait)));
    }
    nextCallAt = Date.now() + 400;

    let accessToken = await getAccessToken(credentials, options);
    requestStarted = true;
    let response = await sendGraphQLRequest(
      credentials.domain,
      query,
      variables,
      accessToken,
      options,
    );
    if (response.status === 401) {
      await invalidateAccessToken(credentials, accessToken);
      accessToken = await getAccessToken(credentials, options);
      requestStarted = true;
      response = await sendGraphQLRequest(
        credentials.domain,
        query,
        variables,
        accessToken,
        options,
      );
    }
    if (!response.ok) {
      throw new ShopifyOperationError(
        `Shopify Admin API returned HTTP ${response.status}.`,
        isMutation && response.status >= 500,
      );
    }
    let result: GraphQLResponse<T>;
    try {
      result = (await response.json()) as GraphQLResponse<T>;
    } catch {
      throw new ShopifyOperationError(
        "Shopify Admin API returned an invalid response.",
        isMutation,
      );
    }
    if (result.errors?.length) {
      const message = result.errors.map((error) => error.message).join("; ");
      const scopeMatch = message.match(/(?:required access:\s*|requires?\s+|missing\s+)?`?(read_[a-z_]+|write_[a-z_]+)`?\s+access scope/i);
      throw new ShopifyOperationError(
        `Shopify GraphQL error: ${message}`,
        isMutation && Boolean(result.data),
        scopeMatch?.[1],
      );
    }
    if (!result.data) throw new Error("Shopify returned an empty GraphQL response.");
    return result.data;
  } catch (error) {
    if (error instanceof ShopifyOperationError) throw error;
    if (error instanceof Error && error.message.startsWith("Shopify ")) {
      throw new ShopifyOperationError(error.message, isMutation && requestStarted);
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ShopifyOperationError(
        "Shopify Admin API request timed out.",
        isMutation && requestStarted,
      );
    }
    throw new ShopifyOperationError(
      "Shopify Admin API request failed.",
      isMutation && requestStarted,
    );
  } finally {
    releaseRequest();
  }
}

function throwUserErrors(userErrors: UserError[] | undefined): void {
  if (userErrors?.length) {
    throw new Error(userErrors.map((error) => error.message).join("; "));
  }
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function ensureShopifyCustomer(
  phone: string,
  firstName: string,
  options: ShopifyRequestOptions = {},
): Promise<string> {
  const found = await graphQL<{
    customers: { nodes: Array<{ id: string; phone: string | null }> };
  }>(FIND_CUSTOMERS_QUERY, { query: `phone:"${phone}"` }, options);
  const matchingCustomer = found.customers.nodes.find(
    (customer) => customer.phone && phoneDigits(customer.phone) === phoneDigits(phone),
  );
  if (matchingCustomer) return matchingCustomer.id;

  const created = await graphQL<{
    customerCreate: {
      customer: { id: string } | null;
      userErrors: UserError[];
    };
  }>(CREATE_CUSTOMER_MUTATION, {
    input: {
      phone,
      firstName,
      tags: ["pending-verification"],
    },
  }, options);
  throwUserErrors(created.customerCreate.userErrors);
  if (!created.customerCreate.customer?.id) {
    throw new Error("Shopify did not return the created customer ID.");
  }
  return created.customerCreate.customer.id;
}

export async function writeShopifyMetafields(
  customerId: string,
  details: CustomerDetails,
  options: ShopifyRequestOptions = {},
): Promise<void> {
  const definitions: Array<[key: string, value: string | undefined, type: string]> = [
    ["contact_person_name_1", details.contactPersonName, "single_line_text_field"],
    ["shop_name", details.shopName, "single_line_text_field"],
    ["mobile_whatsapp_number", details.contactMobileNumber, "single_line_text_field"],
    ["alternate_mobile_number", details.alternateMobileNumber, "single_line_text_field"],
    ["shop_address", details.shopAddress, "single_line_text_field"],
    ["detailed_address", details.detailedAddress, "multi_line_text_field"],
    ["city_name", details.city, "single_line_text_field"],
    ["province", details.province, "single_line_text_field"],
    ["comments", details.comments, "multi_line_text_field"],
  ];
  const metafields = definitions
    .filter(([, value]) => value?.trim())
    .map(([key, value, type]) => ({
    ownerId: customerId,
    namespace: "custom",
    key,
    type,
    value,
    }));
  const metafieldsToDelete = definitions
    .filter(([, value]) => !value?.trim())
    .map(([key]) => ({ ownerId: customerId, namespace: "custom", key }));

  if (metafieldsToDelete.length > 0) {
    const deleted = await graphQL<{
      metafieldsDelete: { userErrors: UserError[] };
    }>(DELETE_METAFIELDS_MUTATION, { metafields: metafieldsToDelete }, options);
    throwUserErrors(deleted.metafieldsDelete.userErrors);
  }
  if (metafields.length > 0) {
    const result = await graphQL<{
      metafieldsSet: { userErrors: UserError[] };
    }>(SET_METAFIELDS_MUTATION, { metafields }, options);
    throwUserErrors(result.metafieldsSet.userErrors);
  }
}

export async function getShopifyCustomerTags(
  customerId: string,
  options: ShopifyRequestOptions = {},
): Promise<string[]> {
  const result = await graphQL<{
    customer: { tags: string[] } | null;
  }>(STATUS_QUERY, { id: customerId }, options);
  if (!result.customer) throw new Error("Linked Shopify customer was not found.");
  return result.customer.tags;
}

export async function writeShopifyStatusTags(
  customerId: string,
  status: AccountStatus,
  currentTags?: readonly string[],
  options: ShopifyRequestOptions = {},
): Promise<void> {
  const tags = currentTags ?? (await getShopifyCustomerTags(customerId, options));
  if (hasShopifyStatusTag(tags, status)) return;
  const desiredTag = shopifyStatusTag(status);

  const result = await graphQL<{
    tagsRemove: { userErrors: UserError[] };
    tagsAdd: { userErrors: UserError[] };
  }>(UPDATE_TAGS_MUTATION, {
    id: customerId,
    tagsToRemove: SHOPIFY_STATUS_TAGS.filter((tag) => tag !== desiredTag),
    tagsToAdd: tags.includes(desiredTag) ? [] : [desiredTag],
  }, options);
  throwUserErrors([...result.tagsRemove.userErrors, ...result.tagsAdd.userErrors]);
}

function withRequiredScope(error: unknown, scope: string): never {
  if (
    error instanceof ShopifyOperationError &&
    (error.requiredScope || /access denied|access scope/i.test(error.message))
  ) {
    throw new ShopifyOperationError(
      "Shopify rejected this request because an Admin API scope is missing.",
      error.outcomeUnknown,
      error.requiredScope ?? scope,
    );
  }
  throw error;
}

export async function getShopifyCheckoutVariants(
  variantIds: string[],
  options: ShopifyRequestOptions = {},
): Promise<{ currencyCode: string; variants: ShopifyCheckoutVariant[] }> {
  let result: CheckoutVariantResponse;
  try {
    result = await graphQL<CheckoutVariantResponse>(CHECKOUT_VARIANTS_QUERY, {
      ids: variantIds,
    }, options);
  } catch (error) {
    withRequiredScope(error, "read_products");
  }
  const variants = result.nodes.flatMap((variant) => {
    if (!variant) return [];
    const price = Number(variant.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Shopify returned an invalid product price.");
    }
    return [{
      variantId: variant.id,
      title: variant.product.title,
      sku: variant.sku ?? "",
      unitPrice: price,
      inventoryQuantity: Math.max(0, variant.inventoryQuantity),
      availableForSale: variant.availableForSale && variant.product.status === "ACTIVE",
    }];
  });
  return { currencyCode: result.shop.currencyCode, variants };
}

function checkoutSearchQuery(customerId: string, createdAt: Date): string {
  const numericCustomerId = customerId.match(/\/(\d+)$/)?.[1];
  if (!numericCustomerId) throw new Error("Linked Shopify customer ID is invalid.");
  return `customer_id:${numericCustomerId} tag:torq-portal created_at:>${createdAt.toISOString()}`;
}

function hasCheckoutKey(attributes: Array<{ key: string; value: string }>, checkoutKey: string) {
  return attributes.some(({ key, value }) =>
    key === "torq_checkout_key" && value === checkoutKey,
  );
}

function toShopifyCreatedOrder(
  order: ShopifyOrderLookup,
): ShopifyCreatedOrder {
  const totalPrice = Number(order.currentTotalPriceSet.shopMoney.amount);
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new Error("Shopify returned an invalid order total.");
  }
  return {
    orderId: order.id,
    orderName: order.name,
    totalPrice,
    currencyCode: order.currentTotalPriceSet.shopMoney.currencyCode,
  };
}

export async function findShopifyPortalCheckout(
  customerId: string,
  checkoutKey: string,
  createdAt: Date,
  options: ShopifyRequestOptions = {},
): Promise<{ draftOrderId: string; order: ShopifyCreatedOrder | null } | null> {
  const query = checkoutSearchQuery(customerId, createdAt);
  let after: string | null = null;
  let draftMatch: ShopifyDraftLookupResponse["draftOrders"]["nodes"][number] | null = null;

  try {
    do {
      const response: ShopifyDraftLookupResponse = await graphQL<ShopifyDraftLookupResponse>(
        FIND_PORTAL_DRAFT_ORDERS_QUERY,
        { after, query },
        options,
      );
      draftMatch = response.draftOrders.nodes.find((draft) =>
        hasCheckoutKey(draft.customAttributes, checkoutKey),
      ) ?? draftMatch;
      if (draftMatch?.order) {
        return { draftOrderId: draftMatch.id, order: toShopifyCreatedOrder(draftMatch.order) };
      }
      after = response.draftOrders.pageInfo.hasNextPage
        ? response.draftOrders.pageInfo.endCursor
        : null;
      if (response.draftOrders.pageInfo.hasNextPage && !after) {
        throw new Error("Shopify draft order search returned no cursor.");
      }
    } while (after);
  } catch (error) {
    withRequiredScope(error, "read_draft_orders");
  }
  if (draftMatch) return { draftOrderId: draftMatch.id, order: null };

  after = null;
  try {
    do {
      const response: ShopifyOrderLookupResponse = await graphQL<ShopifyOrderLookupResponse>(
        FIND_PORTAL_ORDERS_QUERY,
        { after, query },
        options,
      );
      const order = response.orders.nodes.find((candidate) =>
        hasCheckoutKey(candidate.customAttributes, checkoutKey),
      );
      if (order) {
        return {
          draftOrderId: "",
          order: toShopifyCreatedOrder({
            id: order.id,
            name: order.name,
            currentTotalPriceSet: order.currentTotalPriceSet,
          }),
        };
      }
      after = response.orders.pageInfo.hasNextPage
        ? response.orders.pageInfo.endCursor
        : null;
      if (response.orders.pageInfo.hasNextPage && !after) {
        throw new Error("Shopify order search returned no cursor.");
      }
    } while (after);
  } catch (error) {
    withRequiredScope(error, "read_orders");
  }
  return null;
}

export async function getShopifyPortalDraftOrder(
  draftOrderId: string,
  options: ShopifyRequestOptions = {},
): Promise<ShopifyCreatedOrder | null> {
  const query = `query PortalDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      id
      order {
        id
        name
        currentTotalPriceSet { shopMoney { amount currencyCode } }
      }
    }
  }`;
  try {
    const response = await graphQL<{
      draftOrder: { order: ShopifyOrderLookup | null } | null;
    }>(query, { id: draftOrderId }, options);
    if (!response.draftOrder) throw new Error("Shopify draft order was not found.");
    return response.draftOrder.order
      ? toShopifyCreatedOrder(response.draftOrder.order)
      : null;
  } catch (error) {
    withRequiredScope(error, "read_draft_orders");
  }
}

export async function createShopifyPortalDraftOrder(input: {
  customerId: string;
  checkoutKey: string;
  address: ShopifyOrderAddress;
  items: Array<{ variantId: string; quantity: number }>;
}, options: ShopifyRequestOptions = {}): Promise<string> {
  const nameParts = input.address.contactPersonName.trim().split(/\s+/);
  const provinceCodes: Record<string, string> = {
    Punjab: "PK-PB",
    Sindh: "PK-SD",
    "Khyber Pakhtunkhwa": "PK-KP",
    Balochistan: "PK-BA",
    "Islamabad Capital Territory": "PK-IS",
    "Gilgit-Baltistan": "PK-GB",
    "Azad Jammu and Kashmir": "PK-JK",
  };
  try {
    const response = await graphQL<{
      draftOrderCreate: {
        draftOrder: { id: string } | null;
        userErrors: UserError[];
      };
    }>(CREATE_DRAFT_ORDER_MUTATION, {
      input: {
        purchasingEntity: { customerId: input.customerId },
        lineItems: input.items.map(({ variantId, quantity }) => ({ variantId, quantity })),
        tags: ["torq-portal"],
        note: `Shop: ${input.address.shopName}\nMobile: ${input.address.phone}`,
        phone: input.address.phone,
        shippingAddress: {
          firstName: nameParts[0] ?? input.address.contactPersonName,
          lastName: nameParts.slice(1).join(" "),
          company: input.address.shopName,
          address1: input.address.shopAddress,
          address2: input.address.detailedAddress,
          city: input.address.city,
          provinceCode: provinceCodes[input.address.province],
          countryCode: "PK",
          phone: input.address.phone,
        },
        customAttributes: [{ key: "torq_checkout_key", value: input.checkoutKey }],
      },
    }, options);
    throwUserErrors(response.draftOrderCreate.userErrors);
    if (!response.draftOrderCreate.draftOrder?.id) {
      throw new Error("Shopify did not return the draft order ID.");
    }
    return response.draftOrderCreate.draftOrder.id;
  } catch (error) {
    withRequiredScope(error, "write_draft_orders");
  }
}

export async function completeShopifyPortalDraftOrder(
  draftOrderId: string,
  options: ShopifyRequestOptions = {},
): Promise<ShopifyCreatedOrder> {
  try {
    const response = await graphQL<{
      draftOrderComplete: {
        draftOrder: { order: ShopifyOrderLookup | null } | null;
        userErrors: UserError[];
      };
    }>(COMPLETE_DRAFT_ORDER_MUTATION, { id: draftOrderId }, options);
    throwUserErrors(response.draftOrderComplete.userErrors);
    const order = response.draftOrderComplete.draftOrder?.order;
    if (!order) throw new Error("Shopify did not return the completed order.");
    return toShopifyCreatedOrder(order);
  } catch (error) {
    withRequiredScope(error, "write_draft_orders");
  }
}

export async function getActiveShopifyProducts(): Promise<ShopifyStoreProduct[]> {
  const products: ShopifyStoreProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result: ActiveProductsResponse = await graphQL<ActiveProductsResponse>(
      ACTIVE_PRODUCTS_QUERY,
      { after },
    );

    for (const product of result.products.nodes) {
      const variant = product.variants.nodes[0];
      if (!variant) continue;

      const cartonPriceAmount = Number(variant.price);
      const cartonPrice = result.shop.currencyCode === "PKR" &&
        Number.isFinite(cartonPriceAmount) &&
        cartonPriceAmount >= 0
        ? cartonPriceAmount
        : null;
      const piecesValue = product.piecesPerCarton;
      const parsedPieces = piecesValue?.type === "number_integer"
        ? Number(piecesValue.value)
        : NaN;
      const piecesPerCarton = Number.isSafeInteger(parsedPieces) && parsedPieces > 0
        ? parsedPieces
        : null;

      products.push({
        id: product.id,
        variantId: variant.id,
        title: product.title,
        handle: product.handle,
        imageUrl: product.featuredImage?.url ?? null,
        imageAlt: product.featuredImage?.altText ?? product.title,
        sku: variant.sku ?? "",
        cartonPrice,
        pricePerPiece:
          cartonPrice !== null && piecesPerCarton !== null
            ? Math.round(cartonPrice / piecesPerCarton)
            : null,
        piecesPerCarton,
        inventoryCartons: Math.max(0, variant.inventoryQuantity),
      });
    }

    hasNextPage = result.products.pageInfo.hasNextPage;
    after = result.products.pageInfo.endCursor;
    if (hasNextPage && !after) {
      throw new Error("Shopify product pagination returned no cursor.");
    }
  }
  return products;
}
