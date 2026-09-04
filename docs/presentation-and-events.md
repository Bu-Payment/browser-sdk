# Presentation and events

Use the presentation builder for both hosted redirects and supported modal presentations:

```ts
import type { PresentationEvent } from "@bu-payment/browser-sdk";

const abortController = new AbortController();
const handle = buPayment.checkout
  .presentation(checkout)
  .timeoutMs(10 * 60_000)
  .pollIntervalMs(1_000)
  .onEvent((event: PresentationEvent) => console.log(event))
  .signal(abortController.signal)
  .start();

const canonicalCheckout = await handle.completion;
```

## Builder signature and defaults

```ts
presentation(checkout: CheckoutCreated): CheckoutPresentationBuilder
navigate(callback: (url: string) => void): CheckoutPresentationBuilder
timeoutMs(milliseconds: number): CheckoutPresentationBuilder
pollIntervalMs(milliseconds: number): CheckoutPresentationBuilder
cspNonce(nonce: string): CheckoutPresentationBuilder
onEvent(listener: (event: PresentationEvent) => void): CheckoutPresentationBuilder
signal(signal: AbortSignal): CheckoutPresentationBuilder
start(): PresentationHandle<CheckoutLifecycle>
```

The default poll interval is 1,000 ms. Timeout, CSP nonce, event listener, and abort signal are
unset by default. Redirects use `globalThis.location.assign`; `navigate()` replaces that behavior,
which is useful for routers and tests. Modal presentations ignore navigation because they execute in
the current document.

When your Content Security Policy uses nonces, pass the current request nonce with
`.cspNonce(cspNonce)` before `start()`.

`start()` returns a `PresentationHandle<CheckoutLifecycle>` immediately. Its `completion` promise
resolves only after canonical API polling reaches a terminal status. `cancel()` stops local work.

## Events

Events are provider-neutral and contain only `type`, `flow`, and an optional canonical `status`:

- `opening`, `opened`
- `callback_received`, `confirming`
- `polling`
- `completed`, `failed`
- `cancelled`, `timed_out`

Checkout flows are `checkout_redirect`, `checkout_modal`, and `checkout_resume`. Events never expose
session tokens, modal authorization, callback bodies, raw return data, provider identifiers, card
data, or secrets.

A callback cannot manufacture completion. The SDK emits `completed` only after the canonical status
endpoint returns `completed`.
