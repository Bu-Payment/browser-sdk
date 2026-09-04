# Changelog

## [Unreleased]

### Changed

- Card saving now uses an immutable, type-state builder ending in `start()` plus root `resume()` and
  `status()` terminals.
- `resume()` handles both email-verification and hosted-provider returns from the current URL.
- Public setup creation, polling, and confirmation attach the required customer session.

### Removed

- Removed the public `paymentMethods` builder surface and backend-created setup input.

### Migration

```ts
await cardSaving.email(email).currency("EUR").consent(true).start();
const resumed = cardSaving.resume();
const status = await cardSaving.status();
```
