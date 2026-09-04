import { expect, test } from "@playwright/test";
import { modalCheckoutFixture, trustedModalScript } from "./modal-fixture";

test("ignores an untrusted preexisting modal constructor", async ({ page }) => {
  let requests = 0;
  await page.route(trustedModalScript, (route) => {
    requests += 1;
    return route.fulfill({
      contentType: "text/javascript",
      body: `window.tmtPaymentModalSdk = class {
        constructor() { window.trustedConstructorUsed = true; this.handlers = {}; }
        on(name, callback) { this.handlers[name] = callback; }
        closeModal() {}
      }; window.tmtPaymentModalReady();`,
    });
  });
  await page.goto("/");

  const result = await page.evaluate(async (input) => {
    const state = window as unknown as Window & {
      tmtPaymentModalSdk: new () => { on(): void; closeModal(): void };
      trustedConstructorUsed?: boolean;
      untrustedConstructorUsed?: boolean;
    };
    state.tmtPaymentModalSdk = class {
      constructor() {
        state.untrustedConstructorUsed = true;
      }
      on() {}
      closeModal() {}
    };
    const sdkUrl = "/sdk.js";
    const { createBuPaymentClient } = await import(sdkUrl);
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: "https://api.example.test",
      fetch: async (url: URL | RequestInfo) => {
        if (url.toString().endsWith("/application-sessions")) {
          return Response.json({
            token: "session-token",
            expiresAt: "2030-01-01T01:00:00.000Z",
            renewAfter: "2030-01-01T00:30:00.000Z",
            capabilities: ["checkout:create"],
          });
        }
        return Response.json({ ...input, updatedAt: "2030-01-01T00:01:00.000Z" });
      },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const handle = client.checkout.presentation(input).pollIntervalMs(10_000).start();
    for (let attempt = 0; !state.trustedConstructorUsed && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    handle.cancel();
    await handle.completion.catch(() => undefined);
    return {
      trusted: Boolean(state.trustedConstructorUsed),
      untrusted: Boolean(state.untrustedConstructorUsed),
    };
  }, modalCheckoutFixture);

  expect(result).toEqual({ trusted: true, untrusted: false });
  expect(requests).toBe(1);
});
