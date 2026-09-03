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

    const checkout = await client.checkout.create({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 2,
      destinationKey: "default",
    });

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

  it("rejects browser-supplied financial authority before making checkout request", async () => {
    const fetch = createFetch();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    await expect(
      client.checkout.create({
        priceId: "price_1",
        email: "buyer@example.com",
        quantity: 1,
        destinationKey: "default",
        amount: 1,
      } as never),
    ).rejects.toThrow(/unexpected fields/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads canonical status by an encoded opaque reference", async () => {
    const fetch = createFetch({
      reference: "opaque/reference",
      type: "subscription",
      status: "completed",
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:05:00.000Z",
      expiresAt: "2026-09-03T12:30:00.000Z",
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });

    const status = await client.checkout.getStatus("opaque/reference");

    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).pathname).toContain("opaque%2Freference");
    expect(status.status).toBe("completed");
  });

  it("navigates only to an HTTPS redirect without claiming completion", () => {
    const navigate = vi.fn();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(),
    });

    const result = client.checkout.redirect(created as never, navigate);

    expect(navigate).toHaveBeenCalledWith("https://provider.example/checkout/session");
    expect(result).toBeUndefined();
  });

  it("fails closed for insecure or non-redirect presentations", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(),
    });

    expect(() =>
      client.checkout.redirect({
        ...created,
        presentation: { kind: "redirect", url: "http://provider.example/checkout" },
        checkoutUrl: "http://provider.example/checkout",
      } as never),
    ).toThrow(/HTTPS/);
    expect(() =>
      client.checkout.redirect({ ...created, presentation: { kind: "modal" } } as never),
    ).toThrow(/not a redirect/);
  });

  it("validates modal data without executing the presentation", async () => {
    const modal = {
      reference: "bup_co_test_modal",
      type: "subscription",
      status: "pending",
      presentationVersion: 1,
      presentation: {
        kind: "modal",
        script: { url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js" },
        configuration: {
          sessionToken: "opaque",
          amount: 1200,
          currency: "EUR",
          reference: "bup_co_test_modal",
        },
        callback: {
          url: "/public/v1/checkouts/bup_co_test_modal/callback",
          token: "opaque-callback",
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

    const checkout = await client.checkout.create({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 1,
      destinationKey: "default",
    });

    expect(checkout.presentation.kind).toBe("modal");
    expect(() => client.checkout.redirect(checkout)).toThrow(/not a redirect/);
  });

  it("fails closed when modal callback data does not match the API contract", async () => {
    const invalidModal = {
      ...created,
      checkoutUrl: undefined,
      presentation: {
        kind: "modal",
        script: { url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js" },
        configuration: {
          sessionToken: "opaque",
          amount: 1200,
          currency: "EUR",
          reference: "bup_co_test_modal",
        },
        callback: { url: "https://attacker.example/callback", token: "opaque" },
      },
    };
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(invalidModal),
    });

    await expect(
      client.checkout.create({
        priceId: "price_1",
        email: "buyer@example.com",
        quantity: 1,
        destinationKey: "default",
      }),
    ).rejects.toThrow(/callback URL/);
  });
});
