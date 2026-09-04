# Resume and cancellation

After a reload or redirect return, resume the latest stored checkout presentation:

```ts
const handle = buPayment.checkout
  .resume()
  .timeoutMs(10 * 60_000)
  .pollIntervalMs(1_000)
  .onEvent((event) => console.log(event))
  .start();

const canonicalCheckout = await handle.completion;
```

Use an explicit opaque reference when your application already has it:

```ts
const abortController = new AbortController();
const handle = buPayment.checkout
  .resume()
  .reference("checkout_public_reference")
  .signal(abortController.signal)
  .start();
```

## Builder signature and defaults

```ts
resume(): CheckoutResumeBuilder
reference(reference: string): CheckoutResumeBuilder
timeoutMs(milliseconds: number): CheckoutResumeBuilder
pollIntervalMs(milliseconds: number): CheckoutResumeBuilder
cspNonce(nonce: string): CheckoutResumeBuilder
onEvent(listener: (event: PresentationEvent) => void): CheckoutResumeBuilder
signal(signal: AbortSignal): CheckoutResumeBuilder
start(): PresentationHandle<CheckoutLifecycle>
```

Without `reference()`, `start()` reads the latest unexpired checkout reference from scoped
`sessionStorage`. The default poll interval is 1,000 ms; timeout, CSP nonce, listener, and signal are
unset. An active modal is reopened. An active redirect resumes polling without navigating again.

The SDK stores only the opaque reference, flow version, and expiry, scoped to the API URL and
publishable application. It never stores session tokens, callback payloads, modal configuration,
provider IDs, or return queries.

Call `handle.cancel()` or abort the configured signal to stop local polling and close an open modal.
Cancellation rejects `completion` with `AbortError`; timeout rejects it with `TimeoutError`. Neither
operation claims to cancel a server-side payment or emits a successful canonical status.
