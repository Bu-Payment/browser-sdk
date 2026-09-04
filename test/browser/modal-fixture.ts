export const trustedModalScript =
  "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js" as const;

export const modalCheckoutFixture = {
  reference: "checkout_loader",
  type: "payment",
  status: "pending",
  presentationVersion: 1,
  presentation: {
    kind: "modal",
    adapter: "trust-my-travel-payment-modal",
    resource: { url: trustedModalScript, version: "3.6.1" },
    configuration: {
      path: "merchant-path",
      environment: "test",
      booking: {
        id: 44,
        channelId: 2452,
        currency: "EUR",
        amount: 1250,
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
      value: `${"a".repeat(64)}20300101000000`,
      verificationFields: ["reference"],
      expiresAt: "2030-01-01T00:15:00.000Z",
    },
  },
  actions: {
    status: { method: "GET", url: "/public/v1/checkouts/checkout_loader" },
    callback: {
      method: "POST",
      url: "/public/v1/checkouts/checkout_loader/callback",
      token: "checkout_loader",
    },
  },
  createdAt: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:30:00.000Z",
};
