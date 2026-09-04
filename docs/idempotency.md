# Idempotency

Checkout creation always carries an idempotency key. By default the SDK generates a Web Crypto UUID.
Supply a stable key when your application needs retries of the same checkout intent to converge on
one server operation:

```ts
const checkout = await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .idempotencyKey("storefront-order-018f4f90a4c7")
  .create();
```

Explicit keys must contain 16 through 200 printable ASCII characters. Reuse a key only for the same
logical input. If the key is reused with a different input, the API reports
`IdempotencyConflictError`.

GET requests retry bounded transient network, rate-limit, and service failures. Mutations retry only
when protected by an idempotency key; checkout creation always is. The default policy makes at most
three attempts with exponential backoff, honors `Retry-After` up to 30 seconds, and never retries an
aborted operation.
