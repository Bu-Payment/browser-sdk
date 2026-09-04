# @bu-payment/browser-sdk

Browser-safe, provider-neutral access to the BuPayment public catalogue and checkout APIs.

## Install

```sh
bun add @bu-payment/browser-sdk
```

## Quick start

```ts
import { createBuPaymentClient } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});

const { products } = await buPayment.catalogue.list().limit(25).get();
const price = products[0]?.prices[0];

if (price) {
  const checkout = await buPayment.checkout
    .priceId(price.id)
    .email("buyer@example.com")
    .quantity(1)
    .destinationKey("default")
    .create();

  const handle = buPayment.checkout
    .presentation(checkout)
    .timeoutMs(10 * 60_000)
    .start();

  const canonicalCheckout = await handle.completion;
  console.log(canonicalCheckout.status);
}
```

The package is ESM-only, has no runtime dependencies, and targets modern browsers with Fetch, Web
Crypto, URL, URLSearchParams, and AbortController support.

## Documentation

Start with the [Browser SDK documentation](docs/index.md), then explore:

- [Concepts and browser-safe authentication](docs/concepts-and-authentication.md)
- [Catalogue builders](docs/catalogue.md)
- [Checkout builder](docs/checkout.md)
- [Presentation and events](docs/presentation-and-events.md)
- [Canonical lifecycle and status](docs/lifecycle-and-status.md)
- [Idempotency](docs/idempotency.md)
- [Resume and cancellation](docs/resume-and-cancellation.md)
- [Errors](docs/errors.md)
- [Security and limits](docs/security.md)
- [End-to-end examples](docs/examples.md)
- [Payment method setups](docs/payment-methods.md)
