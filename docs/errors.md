# Error handling

API failures are mapped to typed errors with `code`, HTTP `status`, and an optional `requestId`:

```ts
import {
  CapabilityDeniedError,
  CatalogueUnavailableError,
  SessionExpiredError,
  SessionInvalidError,
} from "@bu-payment/browser-sdk";

const abortController = new AbortController();

function reportCatalogueError(error: unknown): void {
  if (error instanceof CapabilityDeniedError) {
    console.error("The application cannot read the catalogue");
    return;
  }
  if (error instanceof SessionInvalidError) {
    console.error("The application session is invalid");
    return;
  }
  if (error instanceof SessionExpiredError) {
    console.error("The application session expired");
    return;
  }
  if (error instanceof CatalogueUnavailableError) {
    console.error("The catalogue is temporarily unavailable");
    return;
  }
  throw error;
}

try {
  await buPayment.catalogue.list().signal(abortController.signal).get();
} catch (error) {
  reportCatalogueError(error);
}
```

All typed API errors extend `BuPaymentError`. Exported specializations cover invalid, expired,
rotated, malformed, or unavailable sessions; capability denial; rate limiting; validation and not
found responses; idempotency conflicts; catalogue availability; and checkout destination, live-mode,
provider, or general availability failures.

Builder argument errors and malformed success responses use `TypeError` or `RangeError`. Abort and
presentation timeout use `DOMException` with names `AbortError` and `TimeoutError` respectively.

Revoked, wrong-origin, and wrong-environment application sessions intentionally share the canonical
`application_session_invalid` code. The SDK does not infer a more specific cause.
