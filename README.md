# @bu-payment/browser-sdk

Framework-agnostic browser access to the BuPayment catalogue, checkout, and card-saving APIs.

## Install

```sh
bun add @bu-payment/browser-sdk
```

## JavaScript quick start

```js
import { createBuPaymentClient, OperationKind } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});

const operation = buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .start();

const result = await operation.completion;
console.log(operation.kind === OperationKind.CHECKOUT, result.status);
```

Runtime values import from the package root. TypeScript types import only from the types entrypoint:

```ts
import { createBuPaymentClient } from "@bu-payment/browser-sdk";
import type { BuPaymentClient, OperationEvent } from "@bu-payment/browser-sdk/types";
```

The package is ESM-only, has no runtime dependencies, and targets browsers with Fetch, Web Crypto,
URL, URLSearchParams, and AbortController.

## Documentation

- [Concepts and configuration](docs/concepts-and-authentication.md)
- [Catalogue](docs/catalogue.md)
- [Checkout](docs/checkout.md)
- [Operations and events](docs/operations-and-events.md)
- [Resume and cancellation](docs/resume-and-cancellation.md)
- [Automatic idempotency](docs/idempotency.md)
- [Errors](docs/errors.md)
- [Card saving](docs/card-saving.md)
- [Security](docs/security.md)
- [Examples](docs/examples.md)
