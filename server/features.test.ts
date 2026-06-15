import { describe, expect, it } from "vitest";
import { calculateWoWChange } from "./metaAds";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// --- Helper to create admin context for tRPC caller ---
function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@maxalding.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "regular-user",
      email: "user@example.com",
      name: "Regular User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// --- calculateWoWChange tests ---
describe("calculateWoWChange", () => {
  it("returns correct percentage for positive change", () => {
    expect(calculateWoWChange(120, 100)).toBe(20);
  });

  it("returns correct percentage for negative change", () => {
    expect(calculateWoWChange(80, 100)).toBe(-20);
  });

  it("returns null when thisWeek is null", () => {
    expect(calculateWoWChange(null, 100)).toBeNull();
  });

  it("returns null when lastWeek is null", () => {
    expect(calculateWoWChange(100, null)).toBeNull();
  });

  it("returns null when lastWeek is zero (avoid division by zero)", () => {
    expect(calculateWoWChange(100, 0)).toBeNull();
  });

  it("returns 0 when both values are equal", () => {
    expect(calculateWoWChange(50, 50)).toBe(0);
  });

  it("handles large percentage increases", () => {
    expect(calculateWoWChange(300, 100)).toBe(200);
  });

  it("handles decimal values correctly", () => {
    expect(calculateWoWChange(3.5, 2.5)).toBe(40);
  });
});

// --- Auth guard tests ---
describe("admin procedure guards", () => {
  it("rejects unauthenticated users from client list", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.clients.list()).rejects.toThrow();
  });

  it("rejects non-admin users from client list", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.clients.list()).rejects.toThrow();
  });

  it("allows admin users to be constructed", () => {
    const ctx = createAdminContext();
    expect(ctx.user?.role).toBe("admin");
  });
});
