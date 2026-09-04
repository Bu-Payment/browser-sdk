# End-to-end examples

## Catalogue to canonical checkout completion

```ts
import {
  createBuPaymentClient,
  type PresentationEvent,
} from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});

const { products } = await buPayment.catalogue.list().limit(25).get();
const price = products.flatMap((product) => product.prices)[0];

if (!price) throw new Error("No purchasable price is available");

const checkout = await buPayment.checkout
  .priceId(price.id)
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .idempotencyKey(`storefront-${crypto.randomUUID()}`)
  .create();

const abortController = new AbortController();
const handle = buPayment.checkout
  .presentation(checkout)
  .timeoutMs(10 * 60_000)
  .pollIntervalMs(1_000)
  .onEvent((event: PresentationEvent) => {
    console.log("Checkout event", event.type);
  })
  .signal(abortController.signal)
  .start();

const canonicalCheckout = await handle.completion;

if (canonicalCheckout.status === "completed") {
  console.log("Checkout completed", canonicalCheckout.reference);
}
```

## Verify a customer and save a card

Start the email verification after the customer gives explicit consent:

```ts
await buPayment.cardSaving
  .email("buyer@example.com")
  .currency("EUR")
  .consent(true)
  .start();
```

Use the same operation when the customer returns from the email link and from the hosted vault. The
SDK reads both return queries and its scoped references internally:

```ts
const handle = buPayment.cardSaving.resume();

const canonicalSetup = await handle.completion;

if (canonicalSetup.status === "succeeded" && canonicalSetup.paymentMethod?.status === "active") {
  console.log("Payment method stored", canonicalSetup.paymentMethod.id);
}
```

## Resume after a reload

```ts
import { createBuPaymentClient } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});

try {
  const handle = buPayment.checkout
    .resume()
    .timeoutMs(10 * 60_000)
    .onEvent((event) => console.log("Checkout event", event.type))
    .start();

  const canonicalCheckout = await handle.completion;
  console.log("Canonical status", canonicalCheckout.status);
} catch (error) {
  if (
    error instanceof TypeError &&
    error.message === "No resumable checkout presentation was found"
  ) {
    console.log("No checkout to resume");
  } else {
    throw error;
  }
}
```
