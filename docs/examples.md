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
const operation = buPayment.operations.resume();
if (operation) await operation.completion;
```

## TypeScript imports

```ts
import { createBuPaymentClient, OperationKind } from "@bu-payment/browser-sdk";
import type { BuPaymentClient, OperationEvent, OperationHandle } from "@bu-payment/browser-sdk/types";
```
