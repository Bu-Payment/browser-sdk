# Examples

## Complete checkout

```js
const operation = buPayment.checkout
  .destinationKey("default")
  .quantity(1)
  .email("buyer@example.com")
  .priceId("price_public_reference")
  .onEvent(({ kind, type }) => console.log(kind, type))
  .start();

const result = await operation.completion;
```

## Resume after a reload or return

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

## TypeScript imports

```ts
import { createBuPaymentClient, OperationKind } from "@bu-payment/browser-sdk";
import type {
  BuPaymentClient,
  OperationEvent,
  OperationHandle,
  ResumedOperation,
} from "@bu-payment/browser-sdk/types";
```
