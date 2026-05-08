import { describe, expect, it } from "vitest";
import { Resend } from "resend";

describe("Resend API Key Validation", () => {
  it("should have RESEND_API_KEY configured", () => {
    expect(process.env.RESEND_API_KEY).toBeDefined();
    expect(process.env.RESEND_API_KEY!.length).toBeGreaterThan(0);
  });

  it("should have RESEND_FROM_EMAIL configured", () => {
    expect(process.env.RESEND_FROM_EMAIL).toBeDefined();
    expect(process.env.RESEND_FROM_EMAIL!.length).toBeGreaterThan(0);
  });

  it("should be able to authenticate with Resend API", async () => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    // Use the domains list endpoint as a lightweight auth check
    const { data, error } = await resend.domains.list();
    // If the key is valid, we should not get an authentication error
    // (we may get an empty list, which is fine)
    expect(error?.name).not.toBe("validation_error");
    // If we get data back (even empty), the key is valid
    if (error) {
      // Only fail if it's an auth error
      expect(error.message).not.toContain("API key is invalid");
    }
  });
});
