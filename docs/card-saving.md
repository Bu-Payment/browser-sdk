# Card saving

Card saving verifies email control before a provider-neutral setup. Explicit consent is required:

```js
await buPayment.cardSaving
  .email("buyer@example.com")
  .currency("EUR")
  .consent(true)
  .start();
```

The frozen type-state builder exposes `start()` only after email, currency, and literal `true`
consent are present. The return URL defaults to the current page without query or fragment and may
be overridden only with a same-origin URL.

On the return page, call `buPayment.operations.resume()`. The SDK handles both emailed verification
links and provider returns, scrubs the query immediately, manages customer-session state, and polls
canonical setup status. Public results contain safe setup and payment-method fields only.

The initial challenge record omits email. Scoped recovery never persists verification tokens,
provider queries, application sessions, or provider configuration. Saving a card does not authorize
charges; confidential backend APIs remain required for merchant-initiated payments.
