import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";

const session = {
  token: "session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["catalogue:read", "checkout:create"],
};

describe("network error boundaries", () => {
  it("preserves an operation timeout when fetch rejects with a native abort error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/application-sessions")) return Response.json(session);
      if (path.endsWith("/catalogue/products")) {
        return Response.json({ data: [], nextCursor: null });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    await client.catalogue.list().get();

    const operation = client.checkout
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .timeoutMs(50)
      .start();

    await expect(operation.completion).rejects.toMatchObject({
      code: ErrorCode.OPERATION_TIMED_OUT,
    });
  });

  it("classifies an aborted successful response body as cancellation", async () => {
    const controller = new AbortController();
    const cause = new DOMException("cancelled", "AbortError");
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json(session);
      }
      const response = new Response();
      response.json = async () => {
        controller.abort(cause);
        throw new DOMException("The operation was aborted", "AbortError");
      };
      return response;
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const error = await client.catalogue
      .list()
      .signal(controller.signal)
      .get()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BuPaymentError);
    expect(error).toMatchObject({ code: ErrorCode.OPERATION_CANCELLED, cause });
  });

  it("classifies an aborted HTTP error body as cancellation", async () => {
    const controller = new AbortController();
    const cause = new DOMException("cancelled", "AbortError");
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
        return Response.json(session);
      }
      const response = new Response(null, { status: 400 });
      response.json = async () => {
        controller.abort(cause);
        throw new DOMException("The operation was aborted", "AbortError");
      };
      return response;
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const error = await client.catalogue
      .list()
      .signal(controller.signal)
      .get()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BuPaymentError);
    expect(error).toMatchObject({ code: ErrorCode.OPERATION_CANCELLED, cause });
  });
});
