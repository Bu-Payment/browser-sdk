# Checkout

The immutable checkout builder accepts required fields in any order. The common path ends in
`start()`, which creates, opens, confirms when needed, and polls canonical status:

```js
const operation = buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .timeoutMs(600_000)
  .onEvent(console.log)
  .start();

const result = await operation.completion;
```

TypeScript exposes `create()` and `start()` only after all four required fields are present.
Configuration calls return new frozen builders and perform no fetch, storage, navigation, polling,
or timer work.

For advanced control, create first and open later:

```js
const checkout = await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .create();

const operation = buPayment.checkout
  .open(checkout)
  .timeoutMs(600_000)
  .start();
```

By default the API resolves the payment provider configured as the environment default. Select one
explicitly with `provider()`:

```js
const checkout = await buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .provider("sisp")
  .create();

checkout.provider; // "sisp"
```

Provider names are lowercase, dash separated, and are configured per environment. An unconfigured
name fails with `ErrorCode.CHECKOUT_PROVIDER_UNKNOWN`. Provider selection is part of the idempotency
intent, so the same fields with a different provider create a distinct checkout. The created
checkout carries the resolved `provider`; canonical status stays provider-neutral and never does.

The returned checkout contains safe canonical fields only. Provider URLs, callbacks,
authorization material, and adapter configuration stay private to the SDK.
