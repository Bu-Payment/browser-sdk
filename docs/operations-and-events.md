# Operations and events

`OperationKind` identifies `CHECKOUT` and `CARD_SAVING`. Every `OperationHandle` exposes `kind`, a
canonical `completion` promise, and `cancel()`.

Checkout builders accept an event listener before `start()`:

```js
const operation = buPayment.checkout
  .priceId("price_public_reference")
  .email("buyer@example.com")
  .quantity(1)
  .destinationKey("default")
  .onEvent((event) => console.log(event.kind, event.type))
  .start();
```

Events are `opening`, `opened`, `callback_received`, `confirming`, `polling`, `completed`, `failed`,
`cancelled`, and `timed_out`. Status events include canonical server status. Events never contain a
checkout reference, email, token, callback payload, URL query, or provider identifier.

Redirect navigation and provider callbacks are progress signals. Only canonical polling determines
financial completion.
