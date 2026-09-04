import { expect, test } from "@playwright/test";

test("never forwards same-origin shopper cookies to BuPayment", async ({ context, page }) => {
  await context.addCookies([
    { name: "shopper_session", value: "private", url: "http://127.0.0.1:47831" },
  ]);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const sdkUrl = "/sdk.js";
    const { createBuPaymentClient } = await import(sdkUrl);
    const client = createBuPaymentClient({
      publishableKey: "bup_pk_test_example",
      apiBaseUrl: location.origin,
    });
    return client.catalogue.list().get();
  });

  expect(result).toEqual({ products: [], pagination: { nextCursor: null } });
});
