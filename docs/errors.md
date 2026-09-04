# Errors

`BuPaymentError` is the only public error class. Branch on `ErrorCode`, never on message text:

```js
import { BuPaymentError, ErrorCode } from "@bu-payment/browser-sdk";

try {
  await operation.completion;
} catch (error) {
  if (error instanceof BuPaymentError && error.code === ErrorCode.OPERATION_CANCELLED) {
    return;
  }
  throw error;
}
```

Stable codes cover application and customer sessions, capabilities, validation, catalogue and
checkout availability, idempotency conflict, configuration, malformed responses, resumption,
cancellation, timeout, network unavailability, and operation failure. HTTP errors may include
`status` and `requestId`. A network failure uses `ErrorCode.NETWORK_UNAVAILABLE`; an aborted request
uses `ErrorCode.OPERATION_CANCELLED`. Messages are descriptive and are not contracts.

When the browser supplies a native network or abort error, it remains available as `error.cause` for
diagnostics. Browsers do not reliably distinguish offline, DNS, TLS, CSP, and CORS failures, so the
SDK does not infer a more specific cause from native message text.

Error JSON contains only the name, code, safe status, request ID, and documented safe metadata.
Causes, credentials, configuration values, customer data, tokens, and provider queries are not
serialized.
