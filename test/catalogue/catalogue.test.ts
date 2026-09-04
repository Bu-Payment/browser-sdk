import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { CatalogueClient } from "../../src/catalogue/client";
import type {
  CatalogueProductPage,
  Price,
  Product,
  ProductWithPrices,
} from "../../src/catalogue/types";
import { createBuPaymentClient } from "../../src/client";
import { price, catalogueSession as session } from "./fixtures";

describe("public catalogue", () => {
  it("omits prices without mutating the original builder", async () => {
    const requestedUrls: URL[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      requestedUrls.push(url);
      if (url.pathname.endsWith("/catalogue/prices")) {
        return Response.json({ data: [], nextCursor: null });
      }
      const product = { id: "prod_1", name: "Starter", description: null };
      return Response.json({ data: [product], nextCursor: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const base = client.catalogue.list().limit(10);

    const [withPrices, withoutPrices] = await Promise.all([
      base.get(),
      base.withoutPrices().cursor("opaque+/=").get(),
    ]);

    expect(withPrices.products[0]).toHaveProperty("prices");
    expect(withoutPrices.products[0]).not.toHaveProperty("prices");
    expect(requestedUrls.every((url) => !url.searchParams.has("include"))).toBe(true);
    const withoutPricesUrl = requestedUrls.find(
      (url) => url.pathname.endsWith("/catalogue/products") && url.searchParams.has("cursor"),
    );
    expect(withoutPricesUrl?.searchParams.get("limit")).toBe("10");
    expect(withoutPricesUrl?.searchParams.get("cursor")).toBe("opaque+/=");
  });

  it("preserves precise result types across catalogue builder states", () => {
    type DefaultResult = ReturnType<ReturnType<CatalogueClient["list"]>["get"]>;
    type WithoutPricesResult = ReturnType<
      ReturnType<ReturnType<CatalogueClient["list"]>["withoutPrices"]>["get"]
    >;
    type ProductResult = ReturnType<ReturnType<CatalogueClient["product"]>["get"]>;

    expectTypeOf<DefaultResult>().toEqualTypeOf<Promise<CatalogueProductPage<ProductWithPrices>>>();
    expectTypeOf<WithoutPricesResult>().toEqualTypeOf<Promise<CatalogueProductPage<Product>>>();
    expectTypeOf<ProductResult>().toEqualTypeOf<Promise<ProductWithPrices>>();
    expectTypeOf<Extract<Price, { type: "one_time" }>["recurring"]>().toEqualTypeOf<null>();
    expectTypeOf<Extract<Price, { type: "recurring" }>["recurring"]>().toEqualTypeOf<{
      interval: "day" | "week" | "month" | "year";
      intervalCount: number;
    }>();
  });

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

    const page = await client.catalogue.list().limit(25).cursor("opaque+/=").withoutPrices().get();

    expect(page.products[0]).toEqual({ id: "prod_1", name: "Starter", description: null });
    expect(page.pagination.nextCursor).toBe("next");
  });

  it("gets one assigned product by encoded identifier", async () => {
    const requestedUrls: URL[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      requestedUrls.push(url);
      if (url.pathname.endsWith("/catalogue/prices")) {
        return Response.json({
          data: [price({ id: "price_1", productId: "product/one", unitAmount: 1200 })],
          nextCursor: null,
        });
      }
      return Response.json({ id: "product/one", name: "One", description: "Public" });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.product("product/one").get()).resolves.toEqual({
      id: "product/one",
      name: "One",
      description: "Public",
      prices: [price({ id: "price_1", productId: "product/one", unitAmount: 1200 })],
    });
    expect(requestedUrls[0]?.pathname.endsWith("/catalogue/products/product%2Fone")).toBe(true);
    expect(requestedUrls[0]?.search).toBe("");
    expect(requestedUrls[1]?.pathname.endsWith("/catalogue/prices")).toBe(true);
    expect(requestedUrls[1]?.searchParams.get("productId")).toBe("product/one");
    expect(requestedUrls[1]?.searchParams.get("limit")).toBe("100");
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

    const page = await client.catalogue.prices().productId("prod_1").get();

    expect(page.data[0]?.recurring).toEqual({ interval: "month", intervalCount: 1 });
  });

  it("retrieves product metadata without prices through an immutable builder", async () => {
    const requestedUrls: URL[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) return Response.json(session);
      requestedUrls.push(url);
      return Response.json({ id: "prod_1", name: "Starter", description: null });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const base = client.catalogue.product("prod_1");
    const metadata = base.withoutPrices();

    await expect(metadata.get()).resolves.toEqual({
      id: "prod_1",
      name: "Starter",
      description: null,
    });
    expect(base).not.toBe(metadata);
    expect(Object.isFrozen(base)).toBe(true);
    expect(requestedUrls[0]?.search).toBe("");
  });

  it("exposes only catalogue builders", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
    });

    expect(client.catalogue).not.toHaveProperty("getProduct");
    expect(client.catalogue).not.toHaveProperty("listPrices");
  });

  it("keeps catalogue state and transport private", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: vi.fn(),
    });

    expect(Object.keys(client.catalogue.list()).sort()).toEqual([
      "cursor",
      "get",
      "limit",
      "signal",
      "withoutPrices",
    ]);
    expect(Object.keys(client.catalogue.product("prod_1")).sort()).toEqual([
      "get",
      "signal",
      "withoutPrices",
    ]);
    expect(Object.keys(client.catalogue.prices()).sort()).toEqual([
      "cursor",
      "get",
      "limit",
      "productId",
      "signal",
    ]);
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

    await expect(client.catalogue.list().withoutPrices().get()).rejects.toMatchObject({
      code: "response_invalid",
    });
  });
});
