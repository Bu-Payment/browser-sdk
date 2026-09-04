import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { CheckoutClient } from "../../src/checkout/client";
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

function createFetch() {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
      return Response.json(session);
    }
    return Response.json(created, { status: init?.method === "POST" ? 201 : 200 });
  });
}

describe("checkout builder", () => {
  it("creates the same checkout through the immutable fluent API", async () => {
    const fetch = createFetch();
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch,
    });
    const controller = new AbortController();
    const email = client.checkout.signal(controller.signal).email("buyer@example.com");
    const destination = email.destinationKey("default");

    const checkout = await destination.priceId("price_1").quantity(2).create();

    const [, init] = fetch.mock.calls.at(-1) ?? [];
    expect(email).not.toBe(destination);
    expect(JSON.parse(String(init?.body))).toEqual({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 2,
      destinationKey: "default",
    });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toHaveLength(36);
    expect(init?.signal).toBe(controller.signal);
    expect(checkout).toMatchObject({ type: "payment", status: "pending" });
  });

  it("exposes create only after every fluent checkout field", () => {
    type EmailBuilder = ReturnType<CheckoutClient["email"]>;
    type DestinationBuilder = ReturnType<EmailBuilder["destinationKey"]>;
    type PriceBuilder = ReturnType<DestinationBuilder["priceId"]>;
    type ReadyBuilder = ReturnType<PriceBuilder["quantity"]>;

    expectTypeOf<"create" extends keyof EmailBuilder ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"create" extends keyof DestinationBuilder ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"create" extends keyof PriceBuilder ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"create" extends keyof ReadyBuilder ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<Parameters<ReadyBuilder["create"]>>().toEqualTypeOf<[]>();
  });

  it("does not expose consumer idempotency configuration", () => {
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_sample",
      apiBaseUrl: "https://api.example.test",
      fetch: createFetch(),
    });

    expect(client.checkout).not.toHaveProperty("idempotencyKey");
    expectTypeOf<
      "idempotencyKey" extends keyof CheckoutClient ? true : false
    >().toEqualTypeOf<false>();
  });
});
