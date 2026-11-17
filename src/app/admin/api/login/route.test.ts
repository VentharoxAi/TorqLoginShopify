import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  createStaffSession: vi.fn(),
  consumeStaffLoginAttempt: vi.fn(),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("@node-rs/argon2", () => ({ verify: mocks.verify }));
vi.mock("@/lib/staff-auth", () => ({
  createStaffSession: mocks.createStaffSession,
  consumeStaffLoginAttempt: mocks.consumeStaffLoginAttempt,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/admin-api", () => ({
  isStaffRequestSameOrigin: () => true,
}));

import { POST } from "./route";

describe("staff login", () => {
  beforeEach(() => {
    mocks.verify.mockReset();
    mocks.createStaffSession.mockReset().mockResolvedValue(undefined);
    mocks.consumeStaffLoginAttempt.mockReset().mockResolvedValue(true);
    mocks.findOne.mockReset();
    mocks.getDatabase.mockReset().mockResolvedValue({
      collection: () => ({ findOne: mocks.findOne }),
    });
  });

  it("uses a generic credential error and does not create a session for invalid users", async () => {
    mocks.findOne.mockResolvedValue(null);

    const response = await POST(new Request("https://torq.example/admin/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://torq.example" },
      body: JSON.stringify({ username: "unknown", password: "wrong-password" }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid username or password." });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.createStaffSession).not.toHaveBeenCalled();
  });

  it("verifies Argon2id credentials before creating a separate staff session", async () => {
    const user = {
      _id: { toString: () => "staff-id" },
      username: "reviewer",
      passwordHash: "$argon2id$stored-hash",
      role: "staff",
      active: true,
      sessionVersion: 0,
    };
    mocks.findOne.mockResolvedValue(user);
    mocks.verify.mockResolvedValue(true);

    const response = await POST(new Request("https://torq.example/admin/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://torq.example" },
      body: JSON.stringify({ username: "reviewer", password: "a-strong-password" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith(user.passwordHash, "a-strong-password");
    expect(mocks.createStaffSession).toHaveBeenCalledWith(user);
  });
});
