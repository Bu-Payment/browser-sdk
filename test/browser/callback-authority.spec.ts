import { expect, test } from "@playwright/test";
import { modalCheckoutFixture, trustedModalScript } from "./modal-fixture";

test("callback failure cannot override canonical completion", async ({ page }) => {
  await page.route(trustedModalScript, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.tmtPaymentModalSdk = class {
        constructor() { window.modal = this; this.handlers = {}; }
        on(name, callback) { this.handlers[name] = callback; }
        closeModal() {}
      }; window.tmtPaymentModalReady();`,
    }),
  );
  await page.goto("/");

  const observed = await page.evaluate(async (checkout) => {
    let callbackStarted = false;
    const sdkUrl = "/sdk.js";
    const { createBuPaymentClient } = await import(sdkUrl);
    const events: Array<{ type: string }> = [];
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async (url: URL | RequestInfo) => {
        const path = url.toString();
        if (path.endsWith("/application-sessions")) {
          return Response.json({
            token: "session-token",
            expiresAt: "2030-01-01T01:00:00.000Z",
            renewAfter: "2030-01-01T00:30:00.000Z",
            capabilities: ["checkout:create"],
          });
        }
        if (path.endsWith("/callback")) {
          callbackStarted = true;
          throw new Error("callback transport failed");
        }
        while (!callbackStarted) await new Promise((resolve) => setTimeout(resolve, 0));
        return Response.json({
          reference: checkout.reference,
          type: checkout.type,
          status: "completed",
          actions: { status: checkout.actions.status },
          createdAt: checkout.createdAt,
          updatedAt: "2030-01-01T00:02:00.000Z",
          expiresAt: checkout.expiresAt,
        });
      },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const handle = client.checkout
      .presentation(checkout)
      .pollIntervalMs(0)
      .onEvent((event: { type: string }) => events.push(event))
      .start();
    for (let attempt = 0; !window.modal && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    window.modal.handlers.transaction_error?.({ status: "untrusted-success" });
    let status = "rejected";
    try {
      status = (await handle.completion).status;
    } catch {}
    return {
      status,
      terminals: events.filter((event) => ["completed", "failed"].includes(event.type)),
    };
  }, modalCheckoutFixture);

  expect(observed.status).toBe("completed");
  expect(observed.terminals).toEqual([
    { type: "completed", flow: "checkout_modal", status: "completed" },
  ]);
});
