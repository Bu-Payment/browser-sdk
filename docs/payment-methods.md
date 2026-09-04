# Payment method setups

Payment-method setup is created by your confidential backend because that operation uses application
HMAC authentication. Give the provider-neutral `PaymentMethodSetup` response to the browser; never
give the browser the HMAC secret.

Every payment-method operation is an immutable builder. Configuration methods only return a new
builder. The terminal methods `status()`, `present()`, and `resume()` perform work.

## Read canonical status

Configure the opaque setup reference and call `status()`:

```ts
const canonicalSetup = await buPayment.paymentMethods
  .reference("setup_public_reference")
  .signal(abortController.signal)
  .status();
```

`reference()` is required for `status()`. The SDK requests the canonical setup resource and validates
the complete `PaymentMethodSetup` response before returning it. Configure `reference()` before
resume-only options such as `returnQuery()` or `timeoutMs()` when the intended terminal is
`status()`; once resume-only state is configured, `status()` is no longer available.

## Present a setup

The current versioned setup presentation is a hosted redirect, including CardVaulter:

```ts
const handle = buPayment.paymentMethods
  .setup(setupFromYourBackend)
  .timeoutMs(10 * 60_000)
  .pollIntervalMs(1_000)
  .onEvent((event) => console.log(event))
  .signal(abortController.signal)
  .navigate((url) => window.location.assign(url))
  .present();

const canonicalSetup = await handle.completion;
```

`present()` validates the setup and redirect URL, stores only the opaque setup reference for a later
return, navigates, and starts canonical polling. It returns
`PresentationHandle<PaymentMethodSetup>` immediately; call `cancel()` to stop local work.

## Confirm a return and resume

On the return page, pass the complete query string without parsing it and call the terminal
`resume()` method:

```ts
const handle = buPayment.paymentMethods
  .reference("setup_public_reference")
  .returnQuery(window.location.search)
  .timeoutMs(10 * 60_000)
  .onEvent((event) => console.log(event))
  .resume();

const canonicalSetup = await handle.completion;

if (canonicalSetup.status === "succeeded" && canonicalSetup.paymentMethod?.status === "active") {
  console.log("Payment method stored", canonicalSetup.paymentMethod.id);
}
```

When `returnQuery()` is configured, `resume()` first relays that opaque value to the canonical
confirmation endpoint. It then polls the canonical status endpoint until the setup reaches
`succeeded`, `failed`, or `expired`. The return query never determines success.

The reference is optional for `resume()`. When omitted, the SDK reads the latest unexpired
payment-method setup reference saved by `present()` in scoped `sessionStorage`:

```ts
const handle = buPayment.paymentMethods
  .returnQuery(window.location.search)
  .resume();
```

If neither an explicit nor a stored reference exists, `resume()` throws a `TypeError`. Without a
return query, it skips confirmation and only resumes canonical polling:

```ts
const handle = buPayment.paymentMethods
  .reference("setup_public_reference")
  .resume();
```

## Builder methods and defaults

```ts
reference(reference: string)
setup(setup: PaymentMethodSetup)
returnQuery(query: string)
navigate(callback: (url: string) => void)
timeoutMs(milliseconds: number)
pollIntervalMs(milliseconds: number)
cspNonce(nonce: string)
onEvent(listener: (event: PresentationEvent) => void)
signal(signal: AbortSignal)

status(): Promise<PaymentMethodSetup>
present(): PresentationHandle<PaymentMethodSetup>
resume(): PresentationHandle<PaymentMethodSetup>
```

The default poll interval is 1,000 ms. Timeout, CSP nonce, event listener, and abort signal are unset.
Redirect presentation uses `globalThis.location.assign` unless `navigate()` supplies another
function. `returnQuery()` accepts 1 to 8,192 characters and is available only to resume builders.

The SDK does not parse or trust returned status, transaction, card, or signature fields. It never
reports a stored method from the query alone. Successful storage is established only by the
canonical setup response containing `status: "succeeded"` and an active payment method.
