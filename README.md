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
const { products, pagination } = await buPayment.catalogue.list().limit(25).get();
```

Without prices:

```ts
const { products, pagination } = await buPayment.catalogue.list().withoutPrices().get();
```

`list()` includes each product's assigned active prices by default in the same HTTP request.
`withoutPrices()` sends `include=none` when only product metadata is needed. Builders are immutable,
so a shared base can safely produce independent paginated or price-free queries. The opaque cursor
for the next page is available as `pagination.nextCursor`. Product and price responses are validated
at runtime and expose only the public fields defined by the API.

## Create checkout

Object form:

```ts
const checkout = await buPayment.checkout.create({
  priceId: "price_public_reference",
  email: "buyer@example.com",
  quantity: 1,
  destinationKey: "default",
});
```

Fluent form (fields may be supplied in any order):

```ts
const checkout = await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .create();
```

The selected server-side price determines whether this is a one-time `payment` or a `subscription`.
Browser callers cannot choose amount, currency, total, provider, tenant, environment, customer ID,
or success/cancellation URLs. Email is customer correlation data only; it never authenticates or
identifies a user of the consuming application.

Mutations receive a Web Crypto UUID idempotency key automatically. You may supply a stable key when
coordinating retries yourself:

Object form:

```ts
await buPayment.checkout.create(input, {
  idempotencyKey: "storefront-order-018f4f90a4c7",
  signal: abortController.signal,
});
```

Fluent form:

```ts
await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .idempotencyKey("storefront-order-018f4f90a4c7")
  .signal(abortController.signal)
  .create();
```

## Hosted redirect and canonical status

```ts
if (checkout.presentation?.kind === "redirect") {
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

Use `present()` for either canonical redirect or modal presentation. It returns a cancelable handle;
the `completion` promise resolves only after canonical API polling reaches a terminal state.

```ts
const controller = new AbortController();
const handle = buPayment.checkout.present(checkout, {
  signal: controller.signal,
  timeoutMs: 10 * 60_000,
  pollIntervalMs: 1_000,
  cspNonce: window.__CSP_NONCE__,
  onEvent(event) {
    // opening, opened, callback_received, confirming, polling,
    // completed, failed, cancelled, or timed_out
    renderCheckoutState(event);
  },
});

const canonicalCheckout = await handle.completion;
```

`cancel()` and an `AbortSignal` stop local work and close an open modal. They do not claim to cancel
the server-side payment. The allowlisted modal events are serialized and relayed to BuPayment;
equivalent replays are deduplicated while distinct events are preserved. Their contents remain
untrusted and never appear in lifecycle events. Even a callback that says "successful" cannot
produce the `completed` event. That event is emitted only for a canonical
`GET /public/v1/checkouts/{reference}` response whose status is `completed`.

Concurrent launches of the same checkout share one handle. All modal launches in a document share
one script load. The internal registry currently accepts only presentation version 1, adapter
`trust-my-travel-payment-modal`, resource version `3.6.1`, and the exact pinned
`https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js` URL. The URL in the response is treated
as an assertion: the loader always uses its compiled constant. Unknown versions, kinds, adapters,
resource URLs, callback actions, verification fields, and configuration fields fail closed before
execution.

The provider-neutral `present()` API maps the closed presentation internally to the Payment Modal
constructor. The consuming application never handles `booking_auth`, provider event hashes, or
callback verification. The short-lived modal authorization remains in memory only and is excluded
from events and resumable storage.

After a return or reload, resume from the canonical API without retaining provider configuration:

```ts
const handle = buPayment.checkout.resume();
const canonicalCheckout = await handle.completion;
```

If the checkout is still an active modal, `resume()` obtains the canonical presentation and reopens
it. Active redirect flows resume polling without redirecting the shopper again. The SDK stores only
the opaque BuPayment reference, flow version, and expiry in origin-scoped
`sessionStorage`. The storage namespace is also scoped to the API URL and publishable application.
Tokens, callback payloads, modal configuration, provider IDs, and return queries are never stored.

## Store a payment method

Payment-method setup is created by your confidential backend because that operation uses
application HMAC authentication. Give the provider-neutral setup response to the browser; never give
the browser the HMAC secret.

```ts
const handle = buPayment.paymentMethods.present(setupFromYourBackend, {
  timeoutMs: 10 * 60_000,
  onEvent: renderPaymentMethodState,
});
```

The current versioned setup presentation is a hosted redirect, including CardVaulter. On the return
page, relay the complete query as an opaque string and then poll the canonical setup:

```ts
const handle = buPayment.paymentMethods.resume(undefined, {
  returnQuery: window.location.search,
});
const canonicalSetup = await handle.completion;

if (canonicalSetup.status === "succeeded" && canonicalSetup.paymentMethod?.status === "active") {
  // The server confirmed a safely stored method.
}
```

The SDK does not parse or trust returned status, transaction, card, or signature fields. It never
reports a stored method from the query alone. `confirm(reference, returnQuery)` and
`getStatus(reference)` are also available when an application needs to coordinate the steps
explicitly.

## Presentation lifecycle events

Events are provider-neutral and contain only `type`, `flow`, and an optional canonical `status`.
They never contain session tokens, callback data, provider identifiers, raw return queries, card
data, or secrets. Supported flows are `checkout_redirect`, `checkout_modal`, `checkout_resume`,
`payment_method_setup`, and `payment_method_resume`.

Modal execution creates a polite status live region, announces deterministic state changes, treats
Escape as cancellation, closes the modal on terminal/cancel/error paths, and restores prior focus.

## Errors, aborts, and retries

```ts
import {
  CapabilityDeniedError,
  SessionExpiredError,
  SessionInvalidError,
} from "@bu-payment/browser-sdk";

try {
  await buPayment.catalogue.list().signal(abortController.signal).get();
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
- Every request uses `credentials: "omit"`, including same-origin proxies, so shopper cookies and
  HTTP authentication are never forwarded.
- No credentialed CORS; the browser supplies the authoritative `Origin` header.
- The package has no side effects, supporting tree shaking and strict Content Security Policy.

For modal checkout, permit scripts and styles from `https://payment.tmtprotects.com` in CSP. When
your policy uses nonces, pass the current nonce as `cspNonce`; the SDK applies it to the pinned
loader element. The browser script-element API does not expose a redirect's final URL, so the SDK
combines an exact HTTPS origin/path/version registry with CSP and fails on script load errors. It
never evaluates response-provided code, HTML, handler names, or arbitrary configuration.

Configure the exact storefront origins on the corresponding BuPayment publishable credential.
The deterministic browser suite intercepts the pinned resource to exercise CSP, lifecycle, races,
and accessibility without depending on a third-party network. It enables, but does not replace,
credentialed provider certification. Run the Playground against the Test API and the real pinned
resource for end-to-end TMT approval.
