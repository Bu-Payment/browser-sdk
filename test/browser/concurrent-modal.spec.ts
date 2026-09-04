import { expect, test } from "@playwright/test";

const trustedScript = "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";

test("concurrent modal launches load the trusted script once", async ({ page }) => {
  let scriptRequests = 0;
  await page.route(trustedScript, (route) => {
    scriptRequests += 1;
    return route.fulfill({
      contentType: "text/javascript",
      body: `window.modals = []; window.tmtPaymentModalSdk = class {
        constructor() { this.handlers = {}; window.modals.push(this); }
        on(name, callback) { this.handlers[name] = callback; }
        closeModal() {}
      }; window.tmtPaymentModalReady();`,
    });
  });
  await page.goto("/");

  const opened = await page.evaluate(async () => {
    const sdkUrl = "/sdk.js";
    const { createBuPaymentClient } = await import(sdkUrl);
    const makeCheckout = (reference: string) => ({
      reference,
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
            amount: 1250,
            allocations: [],
            reference: `provider-${reference}`,
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
          verificationFields: [],
          expiresAt: "2030-01-01T00:15:00.000Z",
        },
      },
      actions: {
        status: { method: "GET", url: `/public/v1/checkouts/${reference}` },
        callback: {
          method: "POST",
          url: `/public/v1/checkouts/${reference}/callback`,
          token: reference,
        },
      },
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:30:00.000Z",
    });
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
        if (input.toString().endsWith("/application-sessions")) {
          return Response.json({
            token: "session-token",
            expiresAt: "2030-01-01T01:00:00.000Z",
            renewAfter: "2030-01-01T00:30:00.000Z",
            capabilities: ["checkout:create"],
          });
        }
        if (input.toString().endsWith("/checkouts") && init?.body) {
          const body = JSON.parse(String(init.body));
          return Response.json(makeCheckout(body.priceId));
        }
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) reject(init.signal.reason);
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      },
    });
    const first = client.checkout
      .priceId("checkout_one")
      .email("one@example.com")
      .quantity(1)
      .destinationKey("default")
      .start();
    const second = client.checkout
      .priceId("checkout_two")
      .email("two@example.com")
      .quantity(1)
      .destinationKey("default")
      .start();
    for (let attempt = 0; window.modals?.length !== 2 && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const count = window.modals?.length;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const results = await Promise.allSettled([first.completion, second.completion]);
    return { count, results: results.map((result) => result.status) };
  });

  expect(opened).toEqual({ count: 2, results: ["rejected", "rejected"] });
  expect(scriptRequests).toBe(1);
});

declare global {
  interface Window {
    modals?: Array<unknown>;
  }
}
