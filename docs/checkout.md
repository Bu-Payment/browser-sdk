# Checkout creation

Checkout creation is an order-independent, immutable builder. Supply the four required selection
fields, then call `create()`:

```ts
const checkout = await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .create();
```

The fields may be supplied in any order. TypeScript exposes the terminal `create()` only after all
four are present:

```ts
const checkout = await buPayment.checkout
  .destinationKey("default")
  .quantity(1)
  .email("buyer@example.com")
  .priceId("price_public_reference")
  .create(); // Promise<CheckoutCreated>
```

## Builder signature

```ts
priceId(priceId: string): CheckoutBuilder
email(email: string): CheckoutBuilder
quantity(quantity: number): CheckoutBuilder
destinationKey(destinationKey: string): CheckoutBuilder
idempotencyKey(idempotencyKey: string): CheckoutBuilder
signal(signal: AbortSignal): CheckoutBuilder
create(): Promise<CheckoutCreated> // available when required fields are set
```

`idempotencyKey()` and `signal()` are optional. Without an explicit idempotency key, the SDK creates
a Web Crypto UUID. There is no default abort signal.

The selected server-side price determines whether the result is a payment or subscription. Browser
callers cannot choose the amount, currency, total, provider, tenant, environment, customer ID, or
success and cancellation URLs. Email is customer correlation data only; it never authenticates the
shopper.

The response is validated as `CheckoutCreated`. If it contains a presentation, continue with the
[presentation builder](presentation-and-events.md). Financial completion must always come from the
[canonical lifecycle](lifecycle-and-status.md).
