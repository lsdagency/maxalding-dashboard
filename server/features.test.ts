import { describe, expect, it } from "vitest";
import { calculateWoWChange } from "./metaAds";
import { generateWeeklyReportEmail } from "./emailService";
import { MetricsComparison, MetricsData } from "../shared/metrics";
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
    const result = calculateWoWChange(120, 100);
    expect(result).toBe(20);
  });

  it("returns correct percentage for negative change", () => {
    const result = calculateWoWChange(80, 100);
    expect(result).toBe(-20);
  });

  it("returns null when thisWeek is null", () => {
    const result = calculateWoWChange(null, 100);
    expect(result).toBeNull();
  });

  it("returns null when lastWeek is null", () => {
    const result = calculateWoWChange(100, null);
    expect(result).toBeNull();
  });

  it("returns null when lastWeek is zero (avoid division by zero)", () => {
    const result = calculateWoWChange(100, 0);
    expect(result).toBeNull();
  });

  it("returns 0 when both values are equal", () => {
    const result = calculateWoWChange(50, 50);
    expect(result).toBe(0);
  });

  it("handles large percentage increases", () => {
    const result = calculateWoWChange(300, 100);
    expect(result).toBe(200);
  });

  it("handles decimal values correctly", () => {
    const result = calculateWoWChange(3.5, 2.5);
    expect(result).toBe(40);
  });
});

// --- generateWeeklyReportEmail tests ---
describe("generateWeeklyReportEmail", () => {
  const sampleMetrics: MetricsComparison = {
    thisWeek: {
      cost: 1500.50,
      reach: 25000,
      thumbStopRate: 35.5,
      holdRate: 22.3,
      frequency: 2.1,
      cpm: 12.50,
      linkClicks: 450,
      ctr: 3.2,
      leads: 28,
      costPerLead: 53.59,
      leadRate: 6.22,
    },
    lastWeek: {
      cost: 1200.00,
      reach: 20000,
      thumbStopRate: 30.0,
      holdRate: 20.0,
      frequency: 1.8,
      cpm: 10.00,
      linkClicks: 380,
      ctr: 2.8,
      leads: 22,
      costPerLead: 54.55,
      leadRate: 5.79,
    },
    wowChange: {
      cost: 25.04,
      reach: 25.0,
      thumbStopRate: 18.33,
      holdRate: 11.5,
      frequency: 16.67,
      cpm: 25.0,
      linkClicks: 18.42,
      ctr: 14.29,
      leads: 27.27,
      costPerLead: -1.76,
      leadRate: 7.43,
    },
  };

  it("generates valid HTML email with client name", () => {
    const html = generateWeeklyReportEmail(
      "UBX Baulkham Hills",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("MAXALDING");
    expect(html).toContain("UBX Baulkham Hills");
    expect(html).toContain("2026-04-24");
    expect(html).toContain("2026-04-30");
    expect(html).toContain("PERFORMANCE REPORT");
  });

  it("includes personalized message when provided", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      "Great week! Your campaigns are performing above benchmark.",
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("Great week! Your campaigns are performing above benchmark.");
  });

  it("does not include personalized section when message is null", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    // The personalized message div should not be present
    expect(html).not.toContain("border-left: 3px solid #fff");
  });

  it("includes all metric labels in the table", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("Amount Spent");
    expect(html).toContain("Reach");
    expect(html).toContain("Thumb Stop Rate");
    expect(html).toContain("Hold Rate");
    expect(html).toContain("Frequency");
    expect(html).toContain("CPM");
    expect(html).toContain("Link Clicks");
    expect(html).toContain("CTR");
    expect(html).toContain("Leads");
    expect(html).toContain("Cost Per Lead");
    expect(html).toContain("Lead Rate");
  });

  it("formats currency values with dollar sign", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("$1500.50");
    expect(html).toContain("$53.59");
  });

  it("formats percentage values with percent sign", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("35.50%");
    expect(html).toContain("3.20%");
  });

  it("includes WoW change indicators with correct colors", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    // Positive changes should be green
    expect(html).toContain("#4ade80");
    // Negative changes should be red
    expect(html).toContain("#f87171");
  });

  it("uses Helvetica Neue font family", () => {
    const html = generateWeeklyReportEmail(
      "Test Client",
      sampleMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    expect(html).toContain("Helvetica Neue");
  });

  it("handles null metric values gracefully", () => {
    const nullMetrics: MetricsComparison = {
      thisWeek: {
        cost: null, reach: null, thumbStopRate: null, holdRate: null,
        frequency: null, cpm: null, linkClicks: null, ctr: null,
        leads: null, costPerLead: null, leadRate: null,
      },
      lastWeek: {
        cost: null, reach: null, thumbStopRate: null, holdRate: null,
        frequency: null, cpm: null, linkClicks: null, ctr: null,
        leads: null, costPerLead: null, leadRate: null,
      },
      wowChange: {
        cost: null, reach: null, thumbStopRate: null, holdRate: null,
        frequency: null, cpm: null, linkClicks: null, ctr: null,
        leads: null, costPerLead: null, leadRate: null,
      },
    };

    const html = generateWeeklyReportEmail(
      "Test Client",
      nullMetrics,
      null,
      "2026-04-24",
      "2026-04-30"
    );

    // Should contain em-dash for null values
    expect(html).toContain("—");
    // Should not throw
    expect(html).toContain("MAXALDING");
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
});
