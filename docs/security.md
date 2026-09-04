# Security and limits

- Use only `bup_pk_test_...` or `bup_pk_live_...` publishable keys in browser code.
- Never pass application secrets, dashboard credentials, HMAC keys, provider credentials, or user
  authentication tokens to this SDK.
- Production API URLs require HTTPS. HTTP is accepted only for localhost loopback development.
- Base URLs cannot contain credentials, a query, or a fragment.
- SDK state is versioned, expiring, and scoped to origin, API URL, publishable key, and operation.
- Provider delivery configuration stays internal and is validated against the supported registry.
- Browser requests omit ambient credentials.

The SDK owns technical configuration validation. Build-tool environment loading, dashboard URLs,
application labels, UI persistence, and playground-only Test-mode policy belong to applications.
