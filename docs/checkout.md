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

The returned checkout contains safe canonical fields only. Provider URLs, callbacks,
authorization material, and adapter configuration stay private to the SDK.
