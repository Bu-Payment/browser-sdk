# Changelog

## [Unreleased]

### Changed

- Network failures now reject with `ErrorCode.NETWORK_UNAVAILABLE` and retain the browser error as
  `cause`; request cancellation remains distinct and uses `ErrorCode.OPERATION_CANCELLED`.
- Card saving now uses an immutable, type-state builder ending in `start()` plus root `resume()` and
  `status()` terminals.
- `resume()` handles both email-verification and hosted-provider returns from the current URL.
- `operations.resume()` now returns a discriminated `ResumedOperation` whose `kind` narrows its
  completion value.
- Identified resume failures now reject `completion` with `RESUME_INVALID` or `RESUME_FAILED`
  instead of throwing before an operation handle is returned.
- Public setup creation, polling, and confirmation attach the required customer session.

### Removed

- Removed the public `paymentMethods` builder surface and backend-created setup input.

### Migration

```js
await cardSaving.email(email).currency("EUR").consent(true).start();
const resumed = client.operations.resume();
const status = await cardSaving.status();
```

TypeScript consumers can narrow the resumed value by `OperationKind` before awaiting its correlated
completion type. Import `ResumedOperation` from `@bu-payment/browser-sdk/types` when an explicit
annotation is needed.
