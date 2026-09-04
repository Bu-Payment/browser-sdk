# Automatic checkout idempotency

Checkout creation always carries an SDK-generated idempotency key. Applications do not create,
hash, store, or supply one.

The SDK correlates the canonical checkout intent, reuses a key after an ambiguous network result,
and clears recovery after a confirmed response. Concurrent creation of the same intent shares one
request. A changed price, normalized email, quantity, or destination receives a different key.

Recovery records are versioned, expire after 15 minutes, and are scoped to browser origin, API URL,
publishable key, and checkout operation kind. They contain only an opaque intent digest, UUID, and
expiry. The digest is sensitive pseudonymous data. Raw email, credentials, session tokens, provider
return data, and server responses are never persisted.

Blocked or unavailable browser storage does not prevent an ordinary checkout from starting.
