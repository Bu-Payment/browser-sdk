# Changelog

## [1.0.0] - 2026-09-04

### Changed

- Payment-method operations now use immutable builders with `status()`, `present()`, and `resume()`
  as terminal methods.
- Return confirmation is performed internally by `resume()` before canonical status polling.

### Removed

- Removed the public `paymentMethods.getStatus()`, `paymentMethods.confirm()`, and
  `paymentMethods.present()` imperative methods.
- Removed the argument-based `paymentMethods.resume(reference, options)` signature. Configure
  `reference()`, `returnQuery()`, and lifecycle options before calling `resume()`.

### Migration

```ts
await paymentMethods.reference(reference).signal(signal).status();

const presentation = paymentMethods.setup(setup).timeoutMs(timeoutMs).present();

const resumed = paymentMethods
  .reference(reference)
  .returnQuery(window.location.search)
  .resume();
```
