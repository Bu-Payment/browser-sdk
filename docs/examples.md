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

## Present and resume a payment-method setup

Create the setup on your confidential backend, then give its provider-neutral response to the
browser:

```ts
const handle = buPayment.paymentMethods
  .setup(setupFromYourBackend)
  .timeoutMs(10 * 60_000)
  .onEvent((event) => console.log("Payment method event", event.type))
  .present();

await handle.completion;
```

On the hosted redirect's return page, relay the complete query string. The saved setup reference is
used automatically:

```ts
const handle = buPayment.paymentMethods
  .returnQuery(window.location.search)
  .timeoutMs(10 * 60_000)
  .resume();

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
