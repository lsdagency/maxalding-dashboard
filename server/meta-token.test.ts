import { describe, expect, it } from "vitest";

describe("META_ACCESS_TOKEN configuration", () => {
  it("META_ACCESS_TOKEN environment variable is set and non-empty", () => {
    // The ENV module reads from process.env at import time.
    // In the deployed/dev environment, this should be set via webdev_request_secrets.
    // For this test, we verify the env var is present (it's injected by the platform).
    const token = process.env.META_ACCESS_TOKEN;
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
  });
});
