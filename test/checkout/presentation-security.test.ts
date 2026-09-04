import { describe, expect, test, vi } from "vitest";
import { createBuPaymentClient } from "../../src";

const session = {
  token: "session-token",
  expiresAt: "2030-01-01T01:00:00.000Z",
  renewAfter: "2030-01-01T00:30:00.000Z",
  capabilities: ["checkout:create"],
};
const modal = {
  reference: "checkout_public",
  type: "payment",
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
        reference: "provider-authenticated-reference",
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
      value: `${"a".repeat(64)}20300101000000`,
      verificationFields: ["allocations", "reference"],
      expiresAt: "2030-01-01T00:15:00.000Z",
    },
  },
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
    callback: {
      method: "POST",
      url: "/public/v1/checkouts/checkout_public/callback",
      token: "checkout_public",
    },
  },
  createdAt: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

async function parse(value: unknown) {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(session, 201))
    .mockResolvedValueOnce(response(value));
  return createBuPaymentClient({
    publishableKey: "bup_pk_test_example",
    apiBaseUrl: "https://api.example.test",
    fetch,
  }).checkout.create(
    { priceId: "price_1", email: "buyer@example.com", quantity: 1, destinationKey: "default" },
    { idempotencyKey: "checkout-security-key" },
  );
}

describe("trusted presentation registry", () => {
  test("accepts the exact canonical modal contract", async () => {
    await expect(parse(modal)).resolves.toMatchObject({
      presentation: { adapter: "trust-my-travel-payment-modal" },
    });
  });

  test.each([
    { ...modal, presentationVersion: 2 },
    {
      ...modal,
      presentation: {
        ...modal.presentation,
        resource: { ...modal.presentation.resource, url: `${modal.presentation.resource.url}?x=1` },
      },
    },
    {
      ...modal,
      presentation: {
        ...modal.presentation,
        configuration: { ...modal.presentation.configuration, executable: "alert(1)" },
      },
    },
    {
      ...modal,
      actions: {
        ...modal.actions,
        callback: { ...modal.actions.callback, url: "/public/v1/checkouts/other/callback" },
      },
    },
    { ...modal, presentation: { ...modal.presentation, adapter: "arbitrary-provider" } },
    {
      ...modal,
      presentation: {
        ...modal.presentation,
        authorization: { ...modal.presentation.authorization, verificationFields: ["secret"] },
      },
    },
    { ...modal, presentation: { kind: "iframe", url: "https://evil.test" } },
  ])("rejects an untrusted descriptor before execution %#", async (descriptor) => {
    await expect(parse(descriptor)).rejects.toBeInstanceOf(TypeError);
  });
});
