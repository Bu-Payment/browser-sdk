# Browser SDK documentation

Use `@bu-payment/browser-sdk` to read an application-scoped catalogue and run canonical checkout
flows in a browser without exposing merchant credentials.

- [Concepts and browser-safe authentication](concepts-and-authentication.md)
- [Catalogue](catalogue.md)
- [Checkout creation](checkout.md)
- [Presentation and events](presentation-and-events.md)
- [Canonical lifecycle and status](lifecycle-and-status.md)
- [Idempotency](idempotency.md)
- [Resume and cancellation](resume-and-cancellation.md)
- [Errors](errors.md)
- [Security and limits](security.md)
- [End-to-end examples](examples.md)
- [Payment method presentations](payment-methods.md)

Every catalogue and checkout operation uses an immutable builder. Calling a configuration method
returns a new builder, so a configured base can be reused safely for independent requests.
