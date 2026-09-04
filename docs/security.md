# Security and limits

The Browser SDK is designed for public browser environments:

- It accepts a publishable application key, never an application secret or provider credential.
- It keeps application session tokens in memory and never forwards shopper cookies or HTTP auth.
- Every request uses `credentials: "omit"`, including same-origin proxies.
- It does not use `eval`, dynamic code generation, Node.js APIs, or arbitrary request headers.
- Runtime parsers reject unknown response fields and unsupported presentation contracts.
- Browser callers select a server-side price and destination; they cannot assert financial totals or
  choose provider authority.

Configure the exact storefront origins on the publishable credential. Production API URLs must use
HTTPS. Catalogue limits are integers from 1 through 100; the default is 50. Explicit idempotency keys
are 16 through 200 printable ASCII characters. Modal return queries and provider data are not trusted
as canonical status.

## Modal presentation boundary

The current registry accepts presentation version 1, adapter
`trust-my-travel-payment-modal`, resource version `3.6.1`, and the pinned script URL
`https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js`. Unknown versions, kinds, adapters,
resource URLs, callback actions, verification fields, and configuration fields fail closed before
execution.

Permit scripts and styles from `https://payment.tmtprotects.com` in your Content Security Policy.
When your CSP uses nonces, configure the current nonce with `cspNonce()`. The loader uses its compiled
pinned URL rather than executing a response-provided URL.
