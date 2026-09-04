# Card saving

`cardSaving` is a browser-only, provider-neutral flow. It verifies that the customer controls an
email address before BuPayment stores a card. It never needs an HMAC secret, merchant callback, or
backend-created setup.

## Start verification

Require the customer to actively consent, then start the email challenge:

```ts
const challenge = await buPayment.cardSaving
  .email("buyer@example.com")
  .currency("EUR")
  .consent(true)
  .start();

console.log("Verification expires at", challenge.expiresAt);
```

The builder is immutable, performs no work before `start()`, and exposes `start()` only after email,
currency, and the literal `consent(true)` are configured. The SDK maps consent to BuPayment's
`merchant_initiated_future_payments` consent contract; it never fabricates consent. `returnUrl`
defaults to the current page with its query and fragment removed. Configure `.returnUrl(url)` before
`.start()` to override it; the URL must use the current origin. `.signal(abortSignal)` and
`.timeoutMs(milliseconds)` optionally bound the challenge request.

The response deliberately omits the challenge reference. The SDK stores only that opaque reference,
the normalized currency, the return URL, and expiry. It never stores the customer's email.

## Resume both returns

Use the same zero-argument operation on the page named by `returnUrl`:

```ts
const handle = buPayment.cardSaving.resume();

const result = await handle.completion;
```

`resume()` has no public inputs. It uses secure polling and navigation defaults. Call
`handle.cancel()` to stop local work without changing canonical server state.

For an emailed verification link, `resume()` reads
`bu_customer_verification_token` from `globalThis.location.search`, removes it from the address bar,
exchanges it with the stored challenge, creates a public setup with both browser sessions and a
generated idempotency key, then navigates to the hosted card vault.

For the vault return, `resume()` sends the complete `globalThis.location.search` as an opaque query,
then polls canonical status. Query fields never determine success. The flow succeeds only when the
API reports a succeeded setup with an active payment method.

## Read canonical status

```ts
const result = await buPayment.cardSaving.status();
```

`status()` uses the scoped, unexpired customer session and setup reference stored by the SDK. Both
`status()` and setup confirmation attach `Bu-Payment-Session` and
`Bu-Payment-Customer-Session`. Stored challenge, customer-session, and setup state are scoped to the
current origin, API base URL, and publishable key and are rejected after expiry. Verification tokens
and provider return queries are never persisted.

Saving a card authorizes storage only. Recurring and off-session charges still require the
merchant's confidential backend and HMAC-authenticated API.
