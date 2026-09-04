# Concepts and browser-safe authentication

The Browser SDK authenticates an application, not its shoppers. Your storefront login, session,
roles, and user credentials remain entirely outside BuPayment.

Create one client for an API URL and publishable application key:

```ts
import { createBuPaymentClient } from "@bu-payment/browser-sdk";

const buPayment = createBuPaymentClient({
  publishableKey: "bup_pk_test_your_publishable_key",
  apiBaseUrl: "https://api.example.com",
});
```

The SDK exchanges the publishable key for a short-lived, capability-scoped application session.
The session token remains in memory. Concurrent requests share session bootstrap and early renewal.

A publishable key is safe to embed in browser code, but it does not identify or authenticate a
shopper. Never pass a dashboard JWT, application secret, HMAC key, provider credential, or shopper
token to the SDK. The client does not accept or forward them.

All commerce APIs use immutable builders. Configuration methods return a new builder and perform no
network or presentation work. Only a terminal method such as `get()`, `create()`, `status()`,
`present()`, `resume()`, or `start()` begins the operation.

## Browser requirements

The SDK requires modern browser implementations of Fetch, Web Crypto, URL, URLSearchParams, and
AbortController. `apiBaseUrl` must use HTTPS, except that loopback HTTP is accepted for local
development. Credentials, query parameters, and fragments are not accepted in the base URL.
