# @bu-payment/browser-sdk

Browser-only, provider-neutral access to BuPayment public catalogue and hosted checkout APIs.

The SDK authenticates your **application**, not your shoppers. A consuming application's login,
session, roles, and user credentials stay entirely outside BuPayment and must never be forwarded to
this client.

## Install

```sh
bun add @bu-payment/browser-sdk
```

The package is ESM-only, has no runtime dependencies, and targets modern browsers with Fetch,
Web Crypto, URL, URLSearchParams, and AbortController support.

## Create a client

```ts
import { createBuPaymentClient } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});
```

A publishable key is safe to embed in browser code, but it is not proof of shopper identity. The SDK
exchanges it for a short-lived, capability-scoped application session and keeps the session token in
memory only. Concurrent requests share bootstrap and early renewal operations.

Do not pass a dashboard JWT, merchant application secret, HMAC key, provider credential, or shopper
token. The SDK does not accept or forward them.

## Read the public catalogue

```ts
const products = await buPayment.catalogue.listProducts({ limit: 25 });
const product = await buPayment.catalogue.getProduct(products.data[0].id);
const prices = await buPayment.catalogue.listPrices({ productId: product.id });

if (products.nextCursor) {
  await buPayment.catalogue.listProducts({ cursor: products.nextCursor });
}
```

Cursors are opaque. Product and price responses are validated at runtime and expose only the public
fields defined by the API.

## Create checkout

```ts
const checkout = await buPayment.checkout.create({
  priceId: "price_public_reference",
  email: "buyer@example.com",
  quantity: 1,
  destinationKey: "default",
});
```

The selected server-side price determines whether this is a one-time `payment` or a `subscription`.
Browser callers cannot choose amount, currency, total, provider, tenant, environment, customer ID,
or success/cancellation URLs. Email is customer correlation data only; it never authenticates or
identifies a user of the consuming application.

Mutations receive a Web Crypto UUID idempotency key automatically. You may supply a stable key when
coordinating retries yourself:

```ts
await buPayment.checkout.create(input, {
  idempotencyKey: "storefront-order-018f4f90a4c7",
  signal: abortController.signal,
});
```

## Hosted redirect and canonical status

```ts
if (checkout.presentation.kind === "redirect") {
  buPayment.checkout.redirect(checkout);
}

const lifecycle = await buPayment.checkout.getStatus(checkout.reference);
if (lifecycle.status === "completed") {
  // This is the canonical confirmation signal.
}
```

`redirect()` accepts HTTPS redirect presentations only. A return or cancellation redirect is
navigation, never confirmation. Only `completed` returned by `getStatus()` confirms the financial
outcome.

The current API can also return a validated modal presentation. This release exposes its typed data
but intentionally does not load scripts or relay provider callbacks. Provider-neutral presentation
execution belongs to the separately tracked Browser SDK presentation work.

## Errors, aborts, and retries

```ts
import {
  CapabilityDeniedError,
  SessionExpiredError,
  SessionInvalidError,
} from "@bu-payment/browser-sdk";

try {
  await buPayment.catalogue.listProducts({ signal: abortController.signal });
} catch (error) {
  if (error instanceof CapabilityDeniedError) {
    // The publishable credential does not grant catalogue:read.
  }
  if (error instanceof SessionInvalidError) {
    // Revoked, wrong-origin, wrong-environment, or otherwise invalid scope.
  }
  if (error instanceof SessionExpiredError) {
    // A fresh session could not be established.
  }
}
```

The API intentionally reports revoked, wrong-origin, and wrong-environment states with the same
`application_session_invalid` code to avoid disclosing application scope. The SDK preserves that
canonical boundary rather than guessing a more specific cause.

GET requests retry bounded transient network, rate-limit, and service failures. Mutations retry only
when protected by an idempotency key. Aborted operations never retry. `Retry-After` is honored with
a bounded delay.

## CSP and browser security

- No `eval`, dynamic code generation, cookies, persistent token storage, or Node.js APIs.
- No HMAC signing, confidential application secrets, or provider credentials.
- No arbitrary request-header passthrough.
- No credentialed CORS; the browser supplies the authoritative `Origin` header.
- The package has no side effects, supporting tree shaking and strict Content Security Policy.

Configure the exact storefront origins on the corresponding BuPayment publishable credential.
