import { expect, test } from "@playwright/test";

const trustedScript = "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";

test("modal keeps callback untrusted and restores focus on Escape", async ({ page }) => {
  await page.route(trustedScript, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.tmtPaymentModalSdk = class {
        constructor(options) { window.modalOptions = options; window.modal = this; this.handlers = {}; }
        on(name, callback) { this.handlers[name] = callback; }
        closeModal() { window.modalClosed = true; }
      }; window.tmtPaymentModalReady();`,
    }),
  );
  await page.goto("/");

  const observed = await page.evaluate(async () => {
    const sdkUrl = "/sdk.js";
    const sdkModule = await import(sdkUrl);
    const requests: Array<{ url: string; body?: string }> = [];
    const fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, ...(init?.body ? { body: String(init.body) } : {}) });
      if (url.endsWith("/application-sessions")) {
        return Response.json({
          token: "session-token",
          expiresAt: "2030-01-01T01:00:00.000Z",
          renewAfter: "2030-01-01T00:30:00.000Z",
          capabilities: ["checkout:create"],
        });
      }
      if (url.endsWith("/callback")) return Response.json({ accepted: true });
      while (requests.filter((request) => request.url.endsWith("/callback")).length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return Response.json({
        reference: "checkout_public",
        type: "payment",
        status: "completed",
        actions: {
          status: { method: "GET", url: "/public/v1/checkouts/checkout_public" },
        },
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:02:00.000Z",
        expiresAt: "2030-01-01T00:30:00.000Z",
      });
    };
    const client = sdkModule.createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const events: unknown[] = [];
    const checkout = {
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
            amount: 1250,
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
          description: "Protected trip",
          passengerCount: 2,
          transactionType: "authorize",
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
    document.querySelector<HTMLElement>("#pay")?.focus();
    const handle = client.checkout
      .presentation(checkout)
      .cspNonce("nonce-value")
      .pollIntervalMs(20)
      .onEvent((event: unknown) => events.push(event))
      .start();
    for (let attempt = 0; !window.modal && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const payload = { id: 44, status: "success", hash: "untrusted" };
    window.modal.handlers.transaction_logged?.(payload);
    window.modal.handlers.transaction_logged?.(payload);
    window.modal.handlers.transaction_error?.({ id: 44, status: "error" });
    const completedBeforePoll = events.some(
      (event) => (event as { type?: string }).type === "completed",
    );
    const announcement = document.querySelector('[role="status"]')?.textContent;
    const completion = await handle.completion;
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js"]',
    );
    const options = window.modalOptions;
    const callbackRequests = requests.filter((request) => request.url.endsWith("/callback"));
    const result = {
      completion,
      events,
      completedBeforePoll,
      callbackCount: callbackRequests.length,
      callbackBody: callbackRequests[0]?.body,
      nonce: script?.nonce,
      options,
      announcement,
    };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    return { ...result, modalClosed: window.modalClosed, focus: document.activeElement?.id };
  });

  expect(observed.completedBeforePoll).toBe(false);
  expect(observed.callbackCount).toBe(2);
  expect(observed.completion.status).toBe("completed");
  expect(observed.nonce).toBe("nonce-value");
  expect(observed.options).toEqual({
    path: "merchant-path",
    environment: "test",
    data: {
      booking_auth: `${"a".repeat(64)}20300101000000`,
      booking_id: 44,
      channels: 2452,
      total: 1250,
      currencies: "EUR",
      allocations: [],
      reference: "provider-authenticated-reference",
      payee_name: "Example Buyer",
      payee_email: "buyer@example.com",
      payee_address: "1 Example Street",
      payee_city: "Lisbon",
      payee_postcode: "1000-001",
      payee_country: "PT",
      description: "Protected trip",
      pax: 2,
      transactionType: "authorize",
    },
    verify: ["allocations", "reference"],
  });
  expect(observed.announcement).toBe("Payment dialog opened.");
  expect(observed.modalClosed).toBe(true);
  expect(observed.focus).toBe("pay");
  expect(JSON.stringify(observed.events)).not.toContain("opaque-token");
});

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
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async () => {
        throw new Error("No API call expected before callback");
      },
    });
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
    const first = client.checkout.presentation(makeCheckout("checkout_one")).start();
    const second = client.checkout.presentation(makeCheckout("checkout_two")).start();
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
    modal: { handlers: Record<string, (payload: unknown) => void> };
    modalClosed?: boolean;
    modalOptions: unknown;
    modals?: Array<unknown>;
  }
}
