# Concepts and configuration

The Browser SDK authenticates an application, not its shoppers. Create one client with raw SDK
configuration:

```js
import { createBuPaymentClient } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});
```

Client creation trims and validates the key, normalizes the API URL, enforces HTTPS except for
loopback development, and rejects explicit Test/Live mismatches. Both Test and Live environments
are supported. Failures use `BuPaymentError` with `ErrorCode.CONFIGURATION_INVALID` and do not echo
sensitive values.

The SDK exchanges the key for a short-lived application session held only in memory. Concurrent
requests share bootstrap and renewal. Storefront login, roles, dashboard configuration, and user
credentials remain outside the SDK.
