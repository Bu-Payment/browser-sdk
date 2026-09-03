import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";

const session = {
  token: "session",
  expiresAt: "2026-09-03T12:10:00.000Z",
  renewAfter: "2026-09-03T12:08:00.000Z",
  capabilities: ["catalogue:read", "checkout:create"],
};

describe("public catalogue", () => {
  it("lists products with encoded opaque pagination", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      expect(url.searchParams.get("limit")).toBe("25");
      expect(url.searchParams.get("cursor")).toBe("opaque+/=");
      return Response.json({
        data: [{ id: "prod_1", name: "Starter", description: null }],
        nextCursor: "next",
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const page = await client.catalogue.listProducts({ limit: 25, cursor: "opaque+/=" });

    expect(page.data[0]).toEqual({ id: "prod_1", name: "Starter", description: null });
    expect(page.nextCursor).toBe("next");
  });

  it("gets one assigned product by encoded identifier", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      expect(url.pathname.endsWith("/catalogue/products/product%2Fone")).toBe(true);
      return Response.json({ id: "product/one", name: "One", description: "Public" });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.getProduct("product/one")).resolves.toMatchObject({
      name: "One",
    });
  });

  it("validates recurring price responses at runtime", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      expect(url.searchParams.get("productId")).toBe("prod_1");
      return Response.json({
        data: [
          {
            id: "price_1",
            productId: "prod_1",
            unitAmount: 1200,
            currency: "EUR",
            type: "recurring",
            recurring: { interval: "month", intervalCount: 1 },
            description: null,
            lookupKey: "monthly",
          },
        ],
        nextCursor: null,
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const page = await client.catalogue.listPrices({ productId: "prod_1" });

    expect(page.data[0]?.recurring).toEqual({ interval: "month", intervalCount: 1 });
  });

  it("fails closed when catalogue responses contain private fields", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json(session);
      }
      return Response.json({
        data: [{ id: "prod_1", name: "Starter", description: null, provider: "private" }],
        nextCursor: null,
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.listProducts()).rejects.toThrow(/unexpected fields/);
  });
});
