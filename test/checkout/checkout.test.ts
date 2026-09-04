import { describe, expect, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";

const session = {
  token: "session",
  expiresAt: "2026-09-03T12:10:00.000Z",
  renewAfter: "2026-09-03T12:08:00.000Z",
  capabilities: ["catalogue:read", "checkout:create"],
};

const created = {
  reference: "bup_co_test_reference",
  type: "payment",
  status: "pending",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://provider.example/checkout/session" },
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_reference" },
  },
  checkoutUrl: "https://provider.example/checkout/session",
  createdAt: "2026-09-03T12:00:00.000Z",
  expiresAt: "2026-09-03T12:30:00.000Z",
};

function createFetch(response: unknown = created) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
      return Response.json(session);
    }
    return Response.json(response, { status: init?.method === "POST" ? 201 : 200 });
  });
}

describe("public checkout", () => {
  it("creates checkout using only canonical selection fields and an idempotency key", async () => {
    const fetch = createFetch();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const checkout = await client.checkout
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(2)
      .destinationKey("default")
      .create();

    const [, init] = fetch.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 2,
      destinationKey: "default",
    });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^[!-~]{16,200}$/);
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(checkout).toMatchObject({ type: "payment", status: "pending" });
  });

  it("reads canonical status by an encoded opaque reference", async () => {
    const fetch = createFetch({
      reference: "opaque/reference",
      type: "subscription",
      status: "completed",
      actions: {
        status: { method: "GET", url: "/public/v1/checkouts/opaque/reference" },
      },
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:05:00.000Z",
      expiresAt: "2026-09-03T12:30:00.000Z",
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const status = await client.checkout.status("opaque/reference").get();

    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).pathname).toContain("opaque%2Freference");
    expect(status.status).toBe("completed");
  });

  it("navigates only to an HTTPS redirect without claiming completion", async () => {
    const navigate = vi.fn();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(),
    });

    const handle = client.checkout
      .presentation(created as never)
      .navigate(navigate)
      .start();

    expect(navigate).toHaveBeenCalledWith("https://provider.example/checkout/session");
    handle.cancel();
    await expect(handle.completion).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails closed for insecure or non-redirect presentations", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(),
    });

    expect(() =>
      client.checkout
        .presentation({
          ...created,
          presentation: { kind: "redirect", url: "http://provider.example/checkout" },
          checkoutUrl: "http://provider.example/checkout",
        } as never)
        .start(),
    ).toThrow(/HTTPS/);
  });

  it("validates modal data without executing the presentation", async () => {
    const modal = {
      reference: "bup_co_test_modal",
      type: "subscription",
      status: "pending",
      presentationVersion: 1,
      presentation: {
        kind: "modal",
        adapter: "trust-my-travel-payment-modal",
        resource: {
          url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js",
          version: "3.6.1",
        },
        configuration: {
          path: "merchant-path",
          environment: "test",
          booking: {
            id: 44,
            channelId: 2452,
            currency: "EUR",
            amount: 1200,
            allocations: [],
            reference: "authenticated-reference",
          },
          payer: {
            name: "Example Buyer",
            email: "buyer@example.com",
            address: "1 Example Street",
            city: "Lisbon",
            postalCode: "1000-001",
            country: "PT",
          },
        },
        authorization: {
          value: `${"a".repeat(64)}20260903120000`,
          verificationFields: ["allocations", "reference"],
          expiresAt: "2026-09-03T12:15:00.000Z",
        },
      },
      actions: {
        status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_modal" },
        callback: {
          method: "POST",
          url: "/public/v1/checkouts/bup_co_test_modal/callback",
          token: "bup_co_test_modal",
        },
      },
      createdAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T12:30:00.000Z",
    };
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(modal),
    });

    const checkout = await client.checkout
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .create();

    expect(checkout.presentation?.kind).toBe("modal");
  });

  it("fails closed when modal callback data does not match the API contract", async () => {
    const invalidModal = {
      ...created,
      checkoutUrl: undefined,
      actions: {
        status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_reference" },
        callback: {
          method: "POST",
          url: "/public/v1/checkouts/other/callback",
          token: "bup_co_test_reference",
        },
      },
    };
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(invalidModal),
    });

    await expect(
      client.checkout
        .priceId("price_1")
        .email("buyer@example.com")
        .quantity(1)
        .destinationKey("default")
        .create(),
    ).rejects.toThrow(/Callback action/);
  });

  it.each([
    ["a non-RFC3339 date", { ...created, createdAt: "2026-09-03" }],
    [
      "an oversized presentation URL",
      {
        ...created,
        presentation: { kind: "redirect", url: `https://provider.example/${"x".repeat(4090)}` },
        checkoutUrl: `https://provider.example/${"x".repeat(4090)}`,
      },
    ],
  ])("rejects %s", async (_case, response) => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(response),
    });

    await expect(
      client.checkout
        .priceId("price_1")
        .email("buyer@example.com")
        .quantity(1)
        .destinationKey("default")
        .create(),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
