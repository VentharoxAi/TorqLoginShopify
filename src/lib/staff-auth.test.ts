import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("./db", () => ({
  getDatabase: mocks.database,
}));

import { getStaffSession } from "./staff-auth";

describe("staff session isolation", () => {
  beforeEach(() => {
    mocks.cookieGet.mockReset();
    mocks.database.mockReset();
  });

  it("does not accept the customer session cookie as a staff session", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === "torq_session" ? { value: "customer-session-token" } : undefined,
    );

    await expect(getStaffSession()).resolves.toBeNull();
    expect(mocks.cookieGet).toHaveBeenCalledWith("torq_staff_session");
    expect(mocks.database).not.toHaveBeenCalled();
  });
});
