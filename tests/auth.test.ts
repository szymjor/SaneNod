import { describe, it, expect } from "vitest";
import { safeNext, pairingUrl } from "../packages/auth/src/index";
describe("redirect and token handling", () => {
  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/x\nmalicious",
    "",
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });
  it("keeps an internal destination", () =>
    expect(safeNext("/pair/claim")).toBe("/pair/claim"));
  it("keeps pairing token out of query and path", () => {
    const url = new URL(pairingUrl("https://example.com", "secret"));
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/pair/claim");
    expect(url.hash).toBe("#secret");
  });
});
