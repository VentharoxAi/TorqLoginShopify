import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStaffSession: vi.fn() }));
vi.mock("./staff-auth", () => ({ getStaffSession: mocks.getStaffSession }));

import { authorizeStaff, isStaffRequestSameOrigin } from "./admin-api";

describe("staff action CSRF guard", () => {
  beforeEach(() => {
    mocks.getStaffSession.mockReset();
  });

  it("requires an explicit same-origin header", () => {
    expect(isStaffRequestSameOrigin(new Request("https://torq.example/admin/api/staff", {
      method: "POST",
    }))).toBe(false);
    expect(isStaffRequestSameOrigin(new Request("https://torq.example/admin/api/staff", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
    expect(isStaffRequestSameOrigin(new Request("https://torq.example/admin/api/staff", {
      method: "POST",
      headers: { origin: "https://torq.example" },
    }))).toBe(true);
  });

  it("requires a staff session even when the caller has a customer/admin session elsewhere", async () => {
    mocks.getStaffSession.mockResolvedValue(null);
    const result = await authorizeStaff();
    expect(result.staff).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("restricts staff management to admins", async () => {
    mocks.getStaffSession.mockResolvedValue({
      id: "staff-id",
      username: "reviewer",
      role: "staff",
    });
    const result = await authorizeStaff("admin");
    expect(result.staff).toBeNull();
    expect(result.response?.status).toBe(403);
  });
});
