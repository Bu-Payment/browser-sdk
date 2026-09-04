# Canonical lifecycle and status

Treat only the BuPayment status endpoint as financial authority. Redirect returns, modal callbacks,
and browser navigation are presentation signals, not payment confirmation.

```ts
const lifecycle = await buPayment.checkout
  .status(checkout.reference)
  .signal(abortController.signal)
  .get();

if (lifecycle.status === "completed") {
  console.log("Checkout completed", lifecycle.reference);
}
```

## Builder signature

```ts
status(reference: string): CheckoutStatusBuilder
signal(signal: AbortSignal): CheckoutStatusBuilder
get(): Promise<CheckoutLifecycle>
```

The signal is optional and has no default. The opaque checkout reference is encoded safely in the
request path. Empty references and malformed responses fail closed.

`CheckoutLifecycle.status` is one of:

- `pending`
- `processing`
- `completed`
- `failed`
- `expired`
- `cancelled`

`completed`, `failed`, `expired`, and `cancelled` are terminal for presentation polling. Only
`completed` is successful.
