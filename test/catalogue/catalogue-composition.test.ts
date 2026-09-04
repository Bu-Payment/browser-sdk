import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";
import { catalogueSession, price } from "./fixtures";

describe("catalogue price composition", () => {
  it("composes a product page with all canonical price pages without N+1 requests", async () => {
    const requestedUrls: URL[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) {
        return Response.json(catalogueSession);
      }
      requestedUrls.push(url);
      if (url.pathname.endsWith("/catalogue/prices")) {
        if (url.searchParams.get("cursor") === "price-next") {
          return Response.json({
            data: [price({ id: "price_2", productId: "prod_2", unitAmount: 2400 })],
            nextCursor: null,
          });
        }
        return Response.json({
          data: [
            price({ id: "price_1", productId: "prod_1", unitAmount: 1200 }),
            price({ id: "price_other", productId: "prod_other", unitAmount: 3600 }),
          ],
          nextCursor: "price-next",
        });
      }
      return Response.json({
        data: [
          { id: "prod_1", name: "Starter", description: null },
          { id: "prod_2", name: "Business", description: "For teams" },
        ],
        nextCursor: "product-next",
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const page = await client.catalogue.list().limit(25).get();

    expect(page).toEqual({
      products: [
        {
          id: "prod_1",
          name: "Starter",
          description: null,
          prices: [price({ id: "price_1", productId: "prod_1", unitAmount: 1200 })],
        },
        {
          id: "prod_2",
          name: "Business",
          description: "For teams",
          prices: [price({ id: "price_2", productId: "prod_2", unitAmount: 2400 })],
        },
      ],
      pagination: { nextCursor: "product-next" },
    });
    expect(requestedUrls).toHaveLength(3);
    const productUrl = requestedUrls.find((url) => url.pathname.endsWith("/catalogue/products"));
    expect(productUrl?.searchParams.get("limit")).toBe("25");
    const priceUrls = requestedUrls.filter((url) => url.pathname.endsWith("/catalogue/prices"));
    expect(priceUrls).toHaveLength(2);
    expect(priceUrls[0]?.searchParams.get("limit")).toBe("100");
    expect(priceUrls[0]?.searchParams.has("productId")).toBe(false);
    expect(priceUrls[1]?.searchParams.get("cursor")).toBe("price-next");
  });

  it("cancels while loading prices for a product page", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("cancelled", "AbortError");
    let markPriceRequestStarted: (() => void) | undefined;
    const priceRequestStarted = new Promise<void>((resolve) => {
      markPriceRequestStarted = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) {
        return Response.json(catalogueSession);
      }
      if (url.pathname.endsWith("/catalogue/products")) {
        return Response.json({
          data: [{ id: "prod_1", name: "Starter", description: null }],
          nextCursor: null,
        });
      }
      markPriceRequestStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(cancellation), { once: true });
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const catalogueRequest = client.catalogue.list().signal(controller.signal).get();
    await priceRequestStarted;
    controller.abort(cancellation);

    await expect(catalogueRequest).rejects.toMatchObject({
      code: ErrorCode.OPERATION_CANCELLED,
      cause: cancellation,
    });
  });

  it("retries transient failures while loading composed prices", async () => {
    let priceAttempts = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) {
        return Response.json(catalogueSession);
      }
      if (url.pathname.endsWith("/catalogue/products")) {
        return Response.json({
          data: [{ id: "prod_1", name: "Starter", description: null }],
          nextCursor: null,
        });
      }
      priceAttempts += 1;
      if (priceAttempts === 1) return new Response(null, { status: 503 });
      return Response.json({
        data: [price({ id: "price_1", productId: "prod_1", unitAmount: 1200 })],
        nextCursor: null,
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const page = await client.catalogue.list().get();

    expect(page.products[0]?.prices).toHaveLength(1);
    expect(priceAttempts).toBe(2);
  });

  it("rejects malformed price pages during composition", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/application-sessions")) {
        return Response.json(catalogueSession);
      }
      if (url.pathname.endsWith("/catalogue/products")) {
        return Response.json({
          data: [{ id: "prod_1", name: "Starter", description: null }],
          nextCursor: null,
        });
      }
      return Response.json({
        data: [{ id: "price_1", productId: "prod_1", privateField: true }],
        nextCursor: null,
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(client.catalogue.list().get()).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });
});
