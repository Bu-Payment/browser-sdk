import { expect, test } from "@playwright/test";

const trustedScript = "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";

test("resumes an active modal and Escape cancels without claiming completion", async ({ page }) => {
  await page.route(trustedScript, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.tmtPaymentModalSdk = class {
        constructor() { window.modal = this; this.handlers = {}; }
        on(name, callback) { this.handlers[name] = callback; }
        closeModal() { window.modalClosed = true; }
      }; window.tmtPaymentModalReady();`,
    }),
  );
  await page.goto("/");

  const observed = await page.evaluate(async (scriptUrl) => {
    const sdkUrl = "/sdk.js";
    const { createBuPaymentClient } = await import(sdkUrl);
    const applicationSession = {
      token: "session-token",
      expiresAt: "2030-01-01T01:00:00.000Z",
      renewAfter: "2030-01-01T00:30:00.000Z",
      capabilities: ["checkout:create"],
    };
    const activeCheckout = {
      reference: "checkout_public",
      type: "payment",
      status: "processing",
      presentationVersion: 1,
      presentation: {
        kind: "modal",
        adapter: "trust-my-travel-payment-modal",
        resource: { url: scriptUrl, version: "3.6.1" },
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
        status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
        callback: {
          method: "POST",
          url: "/public/v1/checkouts/checkout_public/callback",
          token: "checkout_public",
        },
      },
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:01:00.000Z",
      expiresAt: "2030-01-01T00:30:00.000Z",
    };
    const { updatedAt: _updatedAt, ...createdCheckout } = activeCheckout;
    const firstResponses = [applicationSession, createdCheckout];
    const firstClient = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async () => Response.json(firstResponses.shift()),
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const checkout = await firstClient.checkout
      .priceId("price")
      .email("buyer@example.com")
      .quantity(1)
      .destinationKey("default")
      .create();
    const first = firstClient.checkout.open(checkout).pollIntervalMs(10_000).start();
    for (let attempt = 0; !window.modal && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    first.cancel();
    await first.completion.catch(() => undefined);
    window.modal = undefined as never;
    window.modalClosed = false;
    const secondResponses = [applicationSession, activeCheckout];
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async () => Response.json(secondResponses.shift()),
      now: () => new Date("2030-01-01T00:00:01.000Z"),
    });
    document.querySelector<HTMLElement>("#pay")?.focus();
    const handle = client.operations.resume();
    if (!handle) throw new Error("Expected resumable checkout");
    for (let attempt = 0; !window.modal && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    let errorCode = "";
    try {
      await handle.completion;
    } catch (error) {
      errorCode = (error as { code?: string }).code ?? "";
    }
    return {
      modalOpened: Boolean(window.modal),
      modalClosed: window.modalClosed,
      focus: document.activeElement?.id,
      errorCode,
      kind: handle.kind,
    };
  }, trustedScript);

  expect(observed.modalOpened).toBe(true);
  expect(observed.modalClosed).toBe(true);
  expect(observed.focus).toBe("pay");
  expect(observed.errorCode).toBe("operation_cancelled");
  expect(observed.kind).toBe("checkout");
});

declare global {
  interface Window {
    modal: { handlers: Record<string, (payload: unknown) => void> };
    modalClosed?: boolean;
  }
}
