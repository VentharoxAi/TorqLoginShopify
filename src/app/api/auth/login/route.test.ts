import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  getDatabase: vi.fn(),
  findOne: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/auth", () => ({ createSession: mocks.createSession }));
vi.mock("@/lib/http", () => ({
  isSameOrigin: () => true,
  badOrigin: () => new Response(null, { status: 403 }),
  readJson: (request: Request) => request.json(),
}));

import { POST } from "./route";

describe("customer login redirect", () => {
  beforeEach(() => {
    mocks.compare.mockReset().mockResolvedValue(true);
    mocks.createSession.mockReset().mockResolvedValue(undefined);
    mocks.findOne.mockReset();
    mocks.getDatabase.mockResolvedValue({
      collection: () => ({ findOne: mocks.findOne }),
    });
  });

  it("sends approved customers directly to the store", async () => {
    mocks.findOne.mockResolvedValue({
      _id: { toString: () => "approved-id" },
      passwordHash: "hash",
      shop_details: { status: "approved", completedAt: new Date() },
    });

    const response = await POST(new Request("https://torq.example/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://torq.example" },
      body: JSON.stringify({ mobileNumber: "+923001234567", password: "password" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ redirectTo: "/store" });
  });

  it.each([
    ["pending", { status: "pending", completedAt: new Date() }, "/dashboard"],
    ["blocked", { status: "blocked", completedAt: new Date() }, "/dashboard"],
    ["details-incomplete", { status: "approved" }, "/account/details"],
  ])("keeps %s login away from the product store", async (_label, shopDetails, redirectTo) => {
    mocks.findOne.mockResolvedValue({
      _id: { toString: () => "customer-id" },
      passwordHash: "hash",
      shop_details: shopDetails,
    });

    const response = await POST(new Request("https://torq.example/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://torq.example" },
      body: JSON.stringify({ mobileNumber: "+923001234567", password: "password" }),
    }));

    await expect(response.json()).resolves.toMatchObject({ redirectTo });
  });
});
