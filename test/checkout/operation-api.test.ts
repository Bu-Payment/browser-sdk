import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createBuPaymentClient } from "../../src/client";
import { OperationKind } from "../../src/constants";
import type { Checkout, CheckoutResult, OperationHandle } from "../../src/types";

const session = {
  token: "session",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const created = {
  reference: "checkout_public",
  type: "payment",
  status: "pending",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://pay.example.test/session" },
  actions: { status: { method: "GET", url: "/public/v1/checkouts/checkout_public" } },
  checkoutUrl: "https://pay.example.test/session",
  createdAt: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};
const completed = {
  reference: "checkout_public",
  type: "payment",
  status: "completed",
  actions: { status: { method: "GET", url: "/public/v1/checkouts/checkout_public" } },
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:01:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};

function clientFor(fetch: typeof globalThis.fetch) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
}

describe("checkout operation API", () => {
  it("keeps side effects behind a frozen type-state start terminal", async () => {
    const responses = [session, created, completed];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()));
    const navigate = vi.fn();
    const events: Array<{ type: string; kind: string }> = [];
    const client = clientFor(fetch);
    const base = client.checkout;
    const ready = base
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .navigate(navigate)
      .pollIntervalMs(0)
      .onEvent((event) => events.push(event));

    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(base).not.toBe(ready);

    const operation: OperationHandle<CheckoutResult> = ready.start();

    expect(operation.kind).toBe(OperationKind.CHECKOUT);
    await expect(operation.completion).resolves.toMatchObject({ status: "completed" });
    expect(navigate).toHaveBeenCalledWith("https://pay.example.test/session");
    expect(events).toEqual([
      { type: "opening", kind: OperationKind.CHECKOUT },
      { type: "opened", kind: OperationKind.CHECKOUT },
      { type: "completed", kind: OperationKind.CHECKOUT, status: "completed" },
    ]);
  });

  it("supports explicit create followed by immutable open", async () => {
    const responses = [session, created, completed];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()));
    const client = clientFor(fetch);
    const checkout: Checkout = await client.checkout
      .priceId("price_1")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .create();

    expect(checkout).not.toHaveProperty("presentation");
    expect(checkout).not.toHaveProperty("actions");
    const base = client.checkout.open(checkout);
    const configured = base.navigate(vi.fn()).pollIntervalMs(0);
    const operation = configured.start();

    expect(base).not.toBe(configured);
    expect(Object.isFrozen(base)).toBe(true);
    await expect(operation.completion).resolves.toMatchObject({ status: "completed" });
  });

  it("exposes no legacy checkout operation paths", () => {
    const client = clientFor(vi.fn());

    expect(client.checkout).not.toHaveProperty("presentation");
    expect(client.checkout).not.toHaveProperty("resume");
    expectTypeOf<
      "presentation" extends keyof typeof client.checkout ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "resume" extends keyof typeof client.checkout ? true : false
    >().toEqualTypeOf<false>();
    function compileOnly() {
      // @ts-expect-error start is absent before all required checkout fields are set.
      client.checkout.start();
    }
    void compileOnly;
  });
});
