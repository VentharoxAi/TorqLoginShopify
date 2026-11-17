import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDatabase: vi.fn(),
  findCustomer: vi.fn(),
  isDatabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

import { getCustomerHeaderCustomer } from "@/lib/customer-header";

describe("customer header session state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      role: "customer",
      customerId: "abcdef0123456789abcdef01",
    });
    mocks.getDatabase.mockResolvedValue({
      collection: () => ({ findOne: mocks.findCustomer }),
    });
    mocks.findCustomer.mockResolvedValue({
      username: "customer",
      shop_details: {
        status: "pending",
        completedAt: new Date("2026-11-17T00:00:00.000Z"),
        contactPersonName: "Shop Contact",
      },
    });
  });

  it("uses the app session and customer document, never a browser-provided status", async () => {
    await expect(getCustomerHeaderCustomer()).resolves.toEqual({
      status: "pending",
      name: "Shop Contact",
    });
    expect(mocks.findCustomer).toHaveBeenCalledOnce();
    expect(mocks.findCustomer.mock.calls[0][1].projection).toMatchObject({
      "shop_details.status": 1,
      "shop_details.completedAt": 1,
    });
  });

  it("shows logged-out state when there is no customer session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(getCustomerHeaderCustomer()).resolves.toEqual({
      status: "guest",
      name: "",
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("requires completed shop details before assigning pending or approved menu state", async () => {
    mocks.findCustomer.mockResolvedValue({
      username: "customer",
      shop_details: { status: "approved" },
    });
    await expect(getCustomerHeaderCustomer()).resolves.toEqual({
      status: "no-details",
      name: "customer",
    });
  });

  it("keeps blocked status ahead of incomplete details", async () => {
    mocks.findCustomer.mockResolvedValue({
      username: "customer",
      shop_details: { status: "blocked" },
    });
    await expect(getCustomerHeaderCustomer()).resolves.toEqual({
      status: "blocked",
      name: "customer",
    });
  });

  it("uses approved state only for completed approved customers", async () => {
    mocks.findCustomer.mockResolvedValue({
      username: "customer",
      shop_details: {
        status: "approved",
        completedAt: new Date("2026-11-17T00:00:00.000Z"),
      },
    });
    await expect(getCustomerHeaderCustomer()).resolves.toEqual({
      status: "approved",
      name: "customer",
    });
  });
});
