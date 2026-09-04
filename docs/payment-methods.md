# Payment method presentations

Payment-method setup is created by your confidential backend because that operation uses application
HMAC authentication. Give the provider-neutral `PaymentMethodSetup` response to the browser; never
give the browser the HMAC secret.

```ts
const handle = buPayment.paymentMethods.present(setupFromYourBackend, {
  timeoutMs: 10 * 60_000,
  onEvent: (event) => console.log(event),
});

const canonicalSetup = await handle.completion;
```

The current versioned setup presentation is a hosted redirect, including CardVaulter. On the return
page, relay the complete query as an opaque string and poll the canonical setup:

```ts
const handle = buPayment.paymentMethods.resume(undefined, {
  returnQuery: window.location.search,
});
const canonicalSetup = await handle.completion;

if (canonicalSetup.status === "succeeded" && canonicalSetup.paymentMethod?.status === "active") {
  console.log("Payment method stored", canonicalSetup.paymentMethod.id);
}
```

`present()` and `resume()` return `PresentationHandle<PaymentMethodSetup>`, with `completion` and
`cancel()`. Their presentation options default in the same way as checkout: 1,000 ms polling and no
timeout, listener, signal, or CSP nonce. `resume()` additionally accepts `returnQuery`.

The SDK does not parse or trust returned status, transaction, card, or signature fields. It never
reports a stored method from the query alone. `confirm(reference, returnQuery)` and
`getStatus(reference)` remain available when an application needs to coordinate those steps
explicitly.
