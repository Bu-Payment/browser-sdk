# Resume and cancellation

One API resumes checkout and card-saving operations:

```js
import { OperationKind } from "@bu-payment/browser-sdk";

const operation = buPayment.operations.resume();

if (operation?.kind === OperationKind.CHECKOUT) {
  const checkout = await operation.completion;
  console.log(checkout.reference);
}

if (operation?.kind === OperationKind.CARD_SAVING) {
  const setup = await operation.completion;
  console.log(setup.id);
}
```

A page with no scoped, unexpired operation returns `undefined`. That is ordinary state, not an
error. The SDK selects the operation from its scoped state and owned URL inputs.

For card-saving returns, the SDK removes the complete query from browser history synchronously,
before verification, confirmation, polling, or navigation begins. Verification tokens and provider
queries are never emitted, returned, or persisted.

Once a resume kind is identified, setup failures are delivered through `operation.completion` as a
`BuPaymentError`. Malformed verification tokens use `ErrorCode.RESUME_INVALID`; other setup failures
use `ErrorCode.RESUME_FAILED`. Calling `resume()` does not require a surrounding `try` block.

Call `operation.cancel()` to stop local work. Cancellation does not claim to cancel server-side
financial work and rejects `completion` with `ErrorCode.OPERATION_CANCELLED`. A configured checkout
timeout rejects with `ErrorCode.OPERATION_TIMED_OUT`.
