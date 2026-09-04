# Canonical lifecycle and status

Only BuPayment canonical status is financial authority. Browser navigation and provider callbacks
are progress signals.

```js
const result = await buPayment.checkout
  .status(checkout.reference)
  .signal(abortController.signal)
  .get();

if (result.status === "completed") console.log("Checkout completed");
```

Checkout status is `pending`, `processing`, `completed`, `failed`, `expired`, or `cancelled`.
`completed` is the only successful terminal state.
