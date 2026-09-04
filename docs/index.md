# Browser SDK documentation

Use `@bu-payment/browser-sdk` to read an application-scoped catalogue and run canonical checkout
flows in a browser without exposing merchant credentials.

- [Concepts and browser-safe authentication](concepts-and-authentication.md)
- [Catalogue](catalogue.md)
- [Checkout creation](checkout.md)
- [Operations and events](operations-and-events.md)
- [Canonical lifecycle and status](lifecycle-and-status.md)
- [Idempotency](idempotency.md)
- [Resume and cancellation](resume-and-cancellation.md)
- [Errors](errors.md)
- [Security and limits](security.md)
- [End-to-end examples](examples.md)
- [Card saving](card-saving.md)

Catalogue, checkout, and card-saving configuration use immutable builders. Resumption is unified at
`client.operations.resume()` and keeps customer-session and operation references internal.
