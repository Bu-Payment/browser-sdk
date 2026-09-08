import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { CheckoutClient } from "../../src/checkout/client";
import { createBuPaymentClient } from "../../src/client";
import { ErrorCode } from "../../src/constants";

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
  provider: "sisp",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://provider.example/checkout/session" },
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_reference" },
  },
  checkoutUrl: "https://provider.example/checkout/session",
  createdAt: "2026-09-03T12:00:00.000Z",
  expiresAt: "2026-09-03T12:30:00.000Z",
};

function createFetch(response: unknown = created, status?: number) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (new URL(String(input)).pathname.endsWith("/application-sessions")) {
      return Response.json(session);
    }
    return Response.json(response, { status: status ?? (init?.method === "POST" ? 201 : 200) });
  });
}

function createClient(fetch: ReturnType<typeof createFetch>) {
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_sample",
    apiBaseUrl: "https://api.example.test",
    fetch,
  });
}

function ready(client: ReturnType<typeof createBuPaymentClient>) {
  return client.checkout
    .priceId("price_1")
    .email("buyer@example.com")
    .quantity(1)
    .destinationKey("default");
}

describe("checkout provider selection", () => {
  it("omits provider from the request body when the caller does not select one", async () => {
    const fetch = createFetch();

    await ready(createClient(fetch)).create();

    const [, init] = fetch.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 1,
      destinationKey: "default",
    });
  });

  it("sends the normalized provider name when the caller selects one", async () => {
    const fetch = createFetch();

    await ready(createClient(fetch)).provider("  Trust-My-Travel  ").create();

    const [, init] = fetch.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      priceId: "price_1",
      email: "buyer@example.com",
      quantity: 1,
      destinationKey: "default",
      provider: "trust-my-travel",
    });
  });

  it.each([
    ["-sisp"],
    ["sisp_pos"],
    ["sisp!"],
    [""],
    ["a".repeat(65)],
  ])("rejects the malformed provider name %j before any request", async (provider) => {
    const fetch = createFetch();

    await expect(ready(createClient(fetch)).provider(provider).create()).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
    expect(
      fetch.mock.calls.every(([input]) => String(input).endsWith("application-sessions")),
    ).toBe(true);
  });

  it("exposes the provider the API resolved on the created checkout", async () => {
    const checkout = await ready(createClient(createFetch())).create();

    expect(checkout.provider).toBe("sisp");
  });

  it("keeps canonical status provider-neutral", async () => {
    const fetch = createFetch({
      reference: "bup_co_test_reference",
      type: "payment",
      status: "completed",
      actions: { status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_reference" } },
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:05:00.000Z",
      expiresAt: "2026-09-03T12:30:00.000Z",
    });

    const result = await createClient(fetch).checkout.status("bup_co_test_reference").get();

    expect(result).not.toHaveProperty("provider");
    expectTypeOf<"provider" extends keyof typeof result ? true : false>().toEqualTypeOf<false>();
  });

  it("accepts a terminal replay that never reached a provider", async () => {
    const fetch = createFetch({
      reference: "bup_co_test_reference",
      type: "payment",
      status: "cancelled",
      actions: { status: { method: "GET", url: "/public/v1/checkouts/bup_co_test_reference" } },
      createdAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T12:30:00.000Z",
    });

    const checkout = await ready(createClient(fetch)).create();

    expect(checkout.status).toBe("cancelled");
    expect(checkout).not.toHaveProperty("provider");
  });

  it.each([
    ["a presented checkout without a provider", { ...created, provider: undefined }],
    ["a malformed provider name", { ...created, provider: "Trust_My_Travel" }],
  ])("fails closed for %s", async (_case, response) => {
    await expect(ready(createClient(createFetch(response))).create()).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });

  it("classifies an unknown provider for the environment", async () => {
    const fetch = createFetch(
      {
        statusCode: 422,
        error: "checkout_provider_unknown",
        message: "The requested payment provider is not available for this environment",
        requestId: "req_provider",
        timestamp: "2026-09-03T12:00:00.000Z",
      },
      422,
    );

    await expect(ready(createClient(fetch)).provider("stripe").create()).rejects.toMatchObject({
      code: ErrorCode.CHECKOUT_PROVIDER_UNKNOWN,
      status: 422,
      requestId: "req_provider",
    });
  });

  it("derives a distinct idempotency key per selected provider", async () => {
    const keys: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (new URL(String(input)).pathname.includes("/application-sessions")) {
        return Response.json(session);
      }
      keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return Response.json(created, { status: 201 });
    });
    const client = createClient(fetch as ReturnType<typeof createFetch>);

    await ready(client).create();
    await ready(client).provider("sisp").create();
    await ready(client).provider("trust-my-travel").create();

    expect(new Set(keys).size).toBe(3);
  });

  it("keeps provider optional in the fluent API", () => {
    type ReadyBuilder = ReturnType<
      ReturnType<
        ReturnType<ReturnType<CheckoutClient["priceId"]>["email"]>["quantity"]
      >["destinationKey"]
    >;

    expectTypeOf<"create" extends keyof ReadyBuilder ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<"provider" extends keyof ReadyBuilder ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<"provider" extends keyof CheckoutClient ? true : false>().toEqualTypeOf<true>();
  });
});
